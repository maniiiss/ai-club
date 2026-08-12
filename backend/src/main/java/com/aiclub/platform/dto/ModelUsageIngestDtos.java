package com.aiclub.platform.dto;

import java.util.List;

/**
 * code-processing 跨服务模型用量回传的 DTO 集合。
 *
 * <p>业务意图：让代码审核、仓库扫描等在 Python 侧发起的模型调用也能纳入
 * {@code agent_invocation_log} 统计。后端 {@code /internal/model-usage/events}
 * 端点接收本结构后委托 {@code ModelUsageIngestService} 落账。
 */
public final class ModelUsageIngestDtos {

    private ModelUsageIngestDtos() {
    }

    /** 批量用量上报请求体。 */
    public record ModelUsageIngestRequest(List<ModelUsageIngestItem> events) {
    }

    /**
     * 单次模型调用的用量事件。
     *
     * @param usageKey        幂等键，落账写入 correlation_id，防止重试导致重复记账
     * @param agentType       智能体类型编码，对应 {@code AgentType} 枚举名（如 CODE_REVIEW）
     * @param provider        模型供应商（OPENAI / ANTHROPIC 等）
     * @param modelName       实际模型 id
     * @param modelConfigId   关联 {@code ai_model_config.id}，可空
     * @param userId          触发用户 id，可空（系统调用）
     * @param projectId       关联项目 id，可空
     * @param bizId           业务关联 id（如 MR iid / scan run id），可空
     * @param action          子动作标识，可空
     * @param promptTokens    输入 token，可空（provider 未返回时）
     * @param completionTokens 输出 token，可空
     * @param totalTokens      合计 token，可空（为空时由后端按输入+输出求和）
     * @param cachedTokens     缓存命中读取的输入 token，可空（provider 未返回或不支持缓存）
     * @param durationMs      耗时毫秒
     * @param status          状态编码，对应 {@code InvocationStatus} 枚举名（SUCCESS/FAILURE 等）
     * @param occurredAt      调用发生时间（ISO-8601），可空
     */
    public record ModelUsageIngestItem(String usageKey,
                                       String agentType,
                                       String provider,
                                       String modelName,
                                       Long modelConfigId,
                                       Long userId,
                                       Long projectId,
                                       Long bizId,
                                       String action,
                                       Integer promptTokens,
                                       Integer completionTokens,
                                       Integer totalTokens,
                                       Integer cachedTokens,
                                       long durationMs,
                                       String status,
                                       String occurredAt) {
    }
}
