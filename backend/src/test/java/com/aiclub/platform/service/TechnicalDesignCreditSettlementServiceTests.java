package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import com.aiclub.platform.domain.model.ExecutionCreditSettlementEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.UserCreditTransactionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionCreditSettlementRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证公众端技术设计按整次任务扣费，并在没有有效设计草稿时幂等退款。
 */
@ExtendWith(MockitoExtension.class)
class TechnicalDesignCreditSettlementServiceTests {

    @Mock private CreditService creditService;
    @Mock private ExecutionCreditSettlementRepository settlementRepository;
    @Mock private ExecutionTaskRepository executionTaskRepository;
    @Mock private ExecutionArtifactRepository executionArtifactRepository;

    @Test
    void shouldChargeOnCreateAndRefundTerminalTaskWithoutDesignDraft() {
        TechnicalDesignCreditSettlementService service = new TechnicalDesignCreditSettlementService(
                creditService, settlementRepository, executionTaskRepository, executionArtifactRepository
        );
        CreditFeatureConfigEntity config = new CreditFeatureConfigEntity();
        config.setFeatureCode("TECHNICAL_DESIGN_AI");
        config.setCostAmount(5);
        UserEntity user = new UserEntity();
        user.setId(7L);
        UserCreditTransactionEntity transaction = new UserCreditTransactionEntity();
        transaction.setId(8L);
        transaction.setUser(user);
        transaction.setTransactionType("CONSUME");
        transaction.setAmount(-5);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(100L);
        when(creditService.requireEnabledFeatureConfig("TECHNICAL_DESIGN_AI")).thenReturn(config);
        when(creditService.consume(any(), any(), any(), any()))
                .thenReturn(new CreditService.CreditConsumptionReservation(transaction, true));
        when(executionTaskRepository.findById(100L)).thenReturn(Optional.of(executionTask));
        when(settlementRepository.save(any(ExecutionCreditSettlementEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ExecutionTaskSummary summary = service.chargeAndCreate(7L, 77L, () -> summary(100L));

        assertThat(summary.id()).isEqualTo(100L);
        verify(settlementRepository).save(any(ExecutionCreditSettlementEntity.class));

        ExecutionCreditSettlementEntity settlement = new ExecutionCreditSettlementEntity();
        settlement.setExecutionTask(executionTask);
        settlement.setConsumeTransaction(transaction);
        settlement.setStatus("CHARGED");
        when(settlementRepository.findByExecutionTaskIdForUpdate(100L)).thenReturn(Optional.of(settlement));
        when(executionArtifactRepository.existsValidTechnicalDesignArtifact(100L)).thenReturn(false);

        service.settleTerminalTask(100L);
        service.settleTerminalTask(100L);

        verify(creditService, org.mockito.Mockito.times(1)).refundConsumption(transaction, "技术设计执行未产生有效设计草稿，自动退回积分");
        assertThat(settlement.getStatus()).isEqualTo("REFUNDED");
    }

    private ExecutionTaskSummary summary(Long id) {
        return new ExecutionTaskSummary(
                id, "技术设计", ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING, "技术设计生成",
                "WORK_ITEM", 77L, 11L, "项目", 77L, "TASK-77", "技术设计", "PENDING",
                null, null, 0, null, null, "等待调度", false, false,
                7L, "Alice", "2026-07-11 12:00:00", "2026-07-11 12:00:00", null, List.of()
        );
    }
}
