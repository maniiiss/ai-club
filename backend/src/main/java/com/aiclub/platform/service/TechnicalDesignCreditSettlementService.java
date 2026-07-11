package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import com.aiclub.platform.domain.model.ExecutionCreditSettlementEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionCreditSettlementRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.NoSuchElementException;
import java.util.function.Supplier;

/**
 * 公众端技术设计积分预扣与异步终态结算服务。
 * 有效设计草稿是保留消费的唯一业务依据，代码理解或错误日志不视为有效交付。
 */
@Service
public class TechnicalDesignCreditSettlementService {

    public static final String FEATURE_CODE = "TECHNICAL_DESIGN_AI";

    private final CreditService creditService;
    private final ExecutionCreditSettlementRepository settlementRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;

    public TechnicalDesignCreditSettlementService(CreditService creditService,
                                                  ExecutionCreditSettlementRepository settlementRepository,
                                                  ExecutionTaskRepository executionTaskRepository,
                                                  ExecutionArtifactRepository executionArtifactRepository) {
        this.creditService = creditService;
        this.settlementRepository = settlementRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.executionArtifactRepository = executionArtifactRepository;
    }

    /**
     * 创建前预扣整次任务费用；领域校验或任务创建失败时立即退回本次新扣积分。
     */
    @Transactional
    public ExecutionTaskSummary chargeAndCreate(Long userId,
                                                Long workItemId,
                                                Supplier<ExecutionTaskSummary> supplier) {
        CreditFeatureConfigEntity config = creditService.requireEnabledFeatureConfig(FEATURE_CODE);
        String businessKey = "technical-design:" + userId + ":" + workItemId + ":" + System.currentTimeMillis();
        CreditService.CreditConsumptionReservation reservation = creditService.consume(
                userId,
                config,
                businessKey,
                "生成技术设计"
        );
        try {
            ExecutionTaskSummary summary = supplier.get();
            ExecutionTaskEntity executionTask = executionTaskRepository.findById(summary.id())
                    .orElseThrow(() -> new NoSuchElementException("技术设计执行任务不存在: " + summary.id()));
            ExecutionCreditSettlementEntity settlement = new ExecutionCreditSettlementEntity();
            settlement.setExecutionTask(executionTask);
            settlement.setConsumeTransaction(reservation.transaction());
            settlement.setFeatureCode(FEATURE_CODE);
            settlement.setStatus("CHARGED");
            settlementRepository.save(settlement);
            return summary;
        } catch (RuntimeException exception) {
            if (reservation.chargedNow()) {
                creditService.refundConsumption(reservation.transaction(), "技术设计任务创建失败，自动退回积分");
            }
            throw exception;
        }
    }

    /**
     * 终态按有效设计草稿结算；行锁和状态机共同避免 MQ 重投或多实例收口造成重复退款。
     */
    @Transactional
    public void settleTerminalTask(Long executionTaskId) {
        settlementRepository.findByExecutionTaskIdForUpdate(executionTaskId).ifPresent(settlement -> {
            if (!"CHARGED".equals(settlement.getStatus())) {
                return;
            }
            if (executionArtifactRepository.existsValidTechnicalDesignArtifact(executionTaskId)) {
                settlement.setStatus("RETAINED");
            } else {
                creditService.refundConsumption(
                        settlement.getConsumeTransaction(),
                        "技术设计执行未产生有效设计草稿，自动退回积分"
                );
                settlement.setStatus("REFUNDED");
            }
            settlementRepository.save(settlement);
        });
    }
}
