package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentInvocationLogEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.AgentTokenUsage;
import com.aiclub.platform.repository.AgentInvocationLogRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 模型 Token 定价与积分换算服务。
 *
 * <p>按 {@link AiModelConfigEntity} 的输入 / 输出 / 缓存命中输入 token 单价，把 token 用量换算为积分成本。
 * 缓存命中输入单价（cachedInputCreditPer1k）为空时按输入单价的 50% 兜底（折扣计费）。
 * 换算结果向上取整为整数积分，token 为 null 按 0 处理。
 *
 * <p>换算公式：cost = ceil( (prompt×input + completion×output + cached×cachedInput) / 1000 )
 */
@Service
@Transactional(readOnly = true)
public class ModelPricingService {

    private static final BigDecimal BD_1000 = new BigDecimal("1000");
    private static final BigDecimal HALF = new BigDecimal("0.5");
    /** 结算状态：已回填 cost_credits 并参与终态结算。 */
    public static final String SETTLE_STATUS_SETTLED = "SETTLED";

    private final AiModelConfigRepository aiModelConfigRepository;
    private final AgentInvocationLogRepository agentInvocationLogRepository;
    /** agent_info.budget_tokens 为空时使用的默认预算 token 数。 */
    private final int defaultBudgetTokens;

    public ModelPricingService(AiModelConfigRepository aiModelConfigRepository,
                               AgentInvocationLogRepository agentInvocationLogRepository,
                               @Value("${platform.credit.agent-default-budget-tokens:4000}") int defaultBudgetTokens) {
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.agentInvocationLogRepository = agentInvocationLogRepository;
        this.defaultBudgetTokens = defaultBudgetTokens;
    }

    /**
     * 校验模型已启用 token 计费且输入/输出单价齐全，返回模型配置供后续计费调用。
     *
     * @throws NoSuchElementException   模型配置不存在
     * @throws IllegalStateException     模型未启用 token 计费或输入/输出单价缺失
     */
    public AiModelConfigEntity requireTokenBillingModel(Long modelConfigId) {
        AiModelConfigEntity model = aiModelConfigRepository.findById(modelConfigId)
                .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + modelConfigId));
        if (!Boolean.TRUE.equals(model.getTokenBillingEnabled())) {
            throw new IllegalStateException("模型未启用 token 计费: " + modelConfigId);
        }
        if (model.getInputCreditPer1k() == null || model.getOutputCreditPer1k() == null) {
            throw new IllegalStateException("模型 token 定价未配置: " + modelConfigId);
        }
        return model;
    }

    /**
     * 按单次调用 token 计算积分成本（向上取整）。调用前应确保模型已启用计费且单价齐全。
     * 缓存命中输入单价为空时按输入单价 × 0.5 兜底。
     */
    public int calculateCost(AiModelConfigEntity model, Integer prompt, Integer completion, Integer cached) {
        BigDecimal inputPrice = model.getInputCreditPer1k();
        BigDecimal outputPrice = model.getOutputCreditPer1k();
        BigDecimal cachedPrice = model.getCachedInputCreditPer1k();
        if (cachedPrice == null) {
            cachedPrice = inputPrice.multiply(HALF);
        }
        BigDecimal total = BigDecimal.ZERO
                .add(bd(prompt).multiply(inputPrice))
                .add(bd(completion).multiply(outputPrice))
                .add(bd(cached).multiply(cachedPrice));
        return total.divide(BD_1000, 0, RoundingMode.CEILING).intValue();
    }

    /**
     * 按 budget_tokens 估算预扣额度，用输出单价（通常最贵）做保守上限预估，确保预扣不低于实际费用。
     * budgetTokens 为空或非正时使用配置默认值。结果最小为 1（避免 0 预扣导致余额校验失效）。
     */
    public int estimatePreCharge(AiModelConfigEntity model, Integer budgetTokens) {
        BigDecimal outputPrice = model.getOutputCreditPer1k();
        if (outputPrice == null) {
            throw new IllegalStateException("模型输出 token 定价未配置: " + model.getId());
        }
        int budget = (budgetTokens == null || budgetTokens <= 0) ? defaultBudgetTokens : budgetTokens;
        BigDecimal estimated = bd(budget).multiply(outputPrice);
        int cost = estimated.divide(BD_1000, 0, RoundingMode.CEILING).intValue();
        return Math.max(cost, 1);
    }

    /**
     * 聚合执行任务的 token 用量（按模型分组，仅未结算日志），供终态结算计算总实际费用。
     */
    public List<AgentTokenUsage> aggregateTaskTokenUsage(Long executionTaskId) {
        return agentInvocationLogRepository.aggregateTokenUsageByTaskGroupByModel(executionTaskId);
    }

    /**
     * 回填执行任务下未结算调用日志的 cost_credits 并标记 SETTLED。
     * 按每条日志自身的模型定价与 token 单独计算，保证逐条可追溯；未启用计费的模型记 0。
     *
     * @return 回填的日志条数
     */
    @Transactional
    public int applyCostToLogs(Long executionTaskId) {
        List<AgentInvocationLogEntity> logs =
                agentInvocationLogRepository.findAllByTaskIdAndSettleStatusIsNull(executionTaskId);
        if (logs.isEmpty()) {
            return 0;
        }
        Set<Long> modelIds = logs.stream()
                .map(AgentInvocationLogEntity::getModelConfigId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, AiModelConfigEntity> modelMap = modelIds.isEmpty()
                ? Map.of()
                : aiModelConfigRepository.findAllById(modelIds).stream()
                        .collect(Collectors.toMap(AiModelConfigEntity::getId, m -> m));
        for (AgentInvocationLogEntity logEntry : logs) {
            AiModelConfigEntity model = logEntry.getModelConfigId() == null
                    ? null : modelMap.get(logEntry.getModelConfigId());
            int cost = 0;
            if (model != null && Boolean.TRUE.equals(model.getTokenBillingEnabled())
                    && model.getInputCreditPer1k() != null && model.getOutputCreditPer1k() != null) {
                cost = calculateCost(model, logEntry.getPromptTokens(),
                        logEntry.getCompletionTokens(), logEntry.getCachedTokens());
            }
            logEntry.setCostCredits(cost);
            logEntry.setSettleStatus(SETTLE_STATUS_SETTLED);
        }
        agentInvocationLogRepository.saveAll(logs);
        return logs.size();
    }

    private static BigDecimal bd(Integer value) {
        return value == null ? BigDecimal.ZERO : new BigDecimal(value);
    }
}
