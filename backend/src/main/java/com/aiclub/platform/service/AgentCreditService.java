package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.CreditFeatureConfigEntity;
import com.aiclub.platform.domain.model.ExecutionCreditSettlementEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.AgentTokenUsage;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.ExecutionCreditSettlementRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.function.Supplier;

/**
 * 智能体 Token 计费服务：预扣 + 异步终态结算。
 *
 * <p>预扣按 {@link AgentEntity#getBudgetTokens()} 与模型输出单价保守预估，余额不足拒绝执行；
 * 终态按 {@code agent_invocation_log}（task_id 关联）聚合实际 token，计算实际费用后退差 / 补扣 / 触顶。
 * 复用 {@link ExecutionCreditSettlementEntity} 的 1:1 task 唯一约束 + 行锁 + 状态机保证幂等。
 *
 * <p>状态机：CHARGED（预扣）-> SETTLED（按实际结算）/ SETTLED_CAPPED（实际超预扣 CAP 倍数，补扣至上限）。
 */
@Service
public class AgentCreditService {

    public static final String FEATURE_AGENT_TOKEN = "AGENT_TOKEN";
    public static final String CHARGE_MODE_TOKEN_BASED = "TOKEN_BASED";
    public static final String STATUS_CHARGED = "CHARGED";
    public static final String STATUS_SETTLED = "SETTLED";
    public static final String STATUS_SETTLED_CAPPED = "SETTLED_CAPPED";

    private final CreditService creditService;
    private final ModelPricingService modelPricingService;
    private final ExecutionCreditSettlementRepository settlementRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    /** 补扣上限倍数：实际费用超过预扣的此倍数时，补扣截断至上限，超出部分标记 SETTLED_CAPPED。 */
    private final double capMultiplier;

    public AgentCreditService(CreditService creditService,
                              ModelPricingService modelPricingService,
                              ExecutionCreditSettlementRepository settlementRepository,
                              ExecutionTaskRepository executionTaskRepository,
                              AiModelConfigRepository aiModelConfigRepository,
                              @Value("${platform.credit.token-settle-cap-multiplier:2.0}") double capMultiplier) {
        this.creditService = creditService;
        this.modelPricingService = modelPricingService;
        this.settlementRepository = settlementRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.capMultiplier = capMultiplier;
    }

    /**
     * 创建前预扣智能体执行费用；任务创建失败立即退回本次新扣积分。
     * 仿照 TechnicalDesignCreditSettlementService.chargeAndCreate 模式：先扣 -> 创建 task -> 落 settlement -> 失败退。
     */
    @Transactional
    public ExecutionTaskSummary chargeAndCreate(Long userId, AgentEntity agent, Supplier<ExecutionTaskSummary> taskSupplier) {
        Long modelConfigId = requireAgentModelConfigId(agent);
        AiModelConfigEntity model = modelPricingService.requireTokenBillingModel(modelConfigId);
        int prepaid = modelPricingService.estimatePreCharge(model, agent.getBudgetTokens());
        CreditFeatureConfigEntity feature = creditService.requireEnabledFeatureConfig(FEATURE_AGENT_TOKEN);
        String businessKey = "agent-task:" + userId + ":" + System.currentTimeMillis();
        CreditService.CreditConsumptionReservation reservation =
                creditService.consume(userId, feature, prepaid, businessKey, "智能体执行预扣");
        try {
            ExecutionTaskSummary summary = taskSupplier.get();
            ExecutionTaskEntity task = executionTaskRepository.findById(summary.id())
                    .orElseThrow(() -> new NoSuchElementException("执行任务不存在: " + summary.id()));
            ExecutionCreditSettlementEntity settlement = new ExecutionCreditSettlementEntity();
            settlement.setExecutionTask(task);
            settlement.setConsumeTransaction(reservation.transaction());
            settlement.setFeatureCode(FEATURE_AGENT_TOKEN);
            settlement.setChargeMode(CHARGE_MODE_TOKEN_BASED);
            settlement.setStatus(STATUS_CHARGED);
            settlement.setModelConfigId(model.getId());
            settlement.setPrepaidCredits(prepaid);
            settlementRepository.save(settlement);
            return summary;
        } catch (RuntimeException exception) {
            if (reservation.chargedNow()) {
                creditService.refundConsumption(reservation.transaction(), "智能体任务创建失败，自动退回积分");
            }
            throw exception;
        }
    }

    /**
     * 异步终态结算：聚合任务实际 token 计算实际费用，与预扣比较后退差 / 补扣 / 触顶。
     * 行锁 + 状态机保证只结算一次（CHARGED 才处理），回填 agent_invocation_log.cost_credits 供看板追溯。
     */
    @Transactional
    public void settleAgentExecution(Long executionTaskId) {
        ExecutionCreditSettlementEntity settlement =
                settlementRepository.findByExecutionTaskIdForUpdate(executionTaskId).orElse(null);
        if (settlement == null) {
            return;
        }
        if (!STATUS_CHARGED.equals(settlement.getStatus()) || !CHARGE_MODE_TOKEN_BASED.equals(settlement.getChargeMode())) {
            return;
        }
        int prepaid = settlement.getPrepaidCredits() == null ? 0 : settlement.getPrepaidCredits();
        Long userId = settlement.getConsumeTransaction().getUser().getId();

        // 按模型聚合实际 token 并计算实际费用（聚合口径：每模型 ceil 一次后求和）
        int actual = calculateActualCredits(executionTaskId);

        // 回填每条调用日志的积分成本，便于看板逐条追溯
        modelPricingService.applyCostToLogs(executionTaskId);

        if (actual <= prepaid) {
            int refundDelta = prepaid - actual;
            if (refundDelta > 0) {
                creditService.refundConsumption(settlement.getConsumeTransaction(), refundDelta, "智能体执行结算退差");
            }
            settlement.setStatus(STATUS_SETTLED);
        } else {
            // 补扣上限 = prepaid * (capMultiplier - 1)，总扣不超过 prepaid * capMultiplier
            int cap = (int) Math.ceil(prepaid * Math.max(capMultiplier - 1, 0));
            int toCharge = actual - prepaid;
            if (toCharge > cap) {
                toCharge = cap;
                settlement.setStatus(STATUS_SETTLED_CAPPED);
            } else {
                settlement.setStatus(STATUS_SETTLED);
            }
            if (toCharge > 0) {
                // 终态补扣不受 feature 熔断影响，使用 getFeatureConfig 而非 requireEnabledFeatureConfig
                CreditFeatureConfigEntity feature = creditService.getFeatureConfig(FEATURE_AGENT_TOKEN);
                String adjustKey = "agent-task:" + userId + ":" + executionTaskId + ":settle";
                creditService.consume(userId, feature, toCharge, adjustKey, "智能体执行结算补扣");
            }
        }
        settlement.setActualCredits(actual);
        settlementRepository.save(settlement);
    }

    /**
     * 按模型聚合任务实际 token 用量并计算实际积分费用。未启用计费或定价缺失的模型跳过。
     */
    private int calculateActualCredits(Long executionTaskId) {
        List<AgentTokenUsage> usages = modelPricingService.aggregateTaskTokenUsage(executionTaskId);
        int actual = 0;
        for (AgentTokenUsage usage : usages) {
            Long modelId = usage.modelConfigId();
            if (modelId == null || modelId == 0L) {
                continue;
            }
            AiModelConfigEntity model = aiModelConfigRepository.findById(modelId).orElse(null);
            if (model == null || !Boolean.TRUE.equals(model.getTokenBillingEnabled())
                    || model.getInputCreditPer1k() == null || model.getOutputCreditPer1k() == null) {
                continue;
            }
            actual += modelPricingService.calculateCost(model,
                    toInt(usage.promptTokens()), toInt(usage.completionTokens()), toInt(usage.cachedTokens()));
        }
        return actual;
    }

    private Long requireAgentModelConfigId(AgentEntity agent) {
        if (agent == null || agent.getAiModelConfig() == null) {
            throw new IllegalArgumentException("智能体未绑定模型配置，无法按 token 计费");
        }
        return agent.getAiModelConfig().getId();
    }

    private static Integer toInt(Long value) {
        return value == null ? 0 : value.intValue();
    }
}
