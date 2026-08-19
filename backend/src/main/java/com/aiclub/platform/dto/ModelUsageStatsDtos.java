package com.aiclub.platform.dto;

import java.util.List;

/**
 * 平台模型调用量统计的 DTO 集合。
 *
 * <p>以「模型」为中心聚合 {@code agent_invocation_log}，与 {@link AgentUsageStatsDtos}
 * 的「按智能体/用户」维度互补。聚合键为 {@code (model_name, provider)}，覆盖
 * {@code ai_model_config} 表内模型、env 配置的 Assistant 模型与 code-processing 回传模型。
 */
public final class ModelUsageStatsDtos {

    private ModelUsageStatsDtos() {
    }

    /**
     * 模型看板查询入参。
     *
     * @param startTime  开始时间（yyyy-MM-dd HH:mm:ss 或 ISO-8601），空则取结束前 7 天
     * @param endTime    结束时间，空则取当前
     * @param modelNames 模型名过滤（按 model_name）
     * @param providers  供应商过滤（OPENAI/ANTHROPIC/ASSISTANT 等）
     * @param agentTypes 调用来源过滤（按 agent_type，AgentType 枚举名）
     * @param granularity 趋势粒度 day/week/month
     * @param limit      排行榜返回条数，默认 20
     */
    public record ModelUsageQueryRequest(String startTime,
                                        String endTime,
                                        List<String> modelNames,
                                        List<String> providers,
                                        List<String> agentTypes,
                                        String granularity,
                                        Integer limit) {
    }

    /** 模型选项（用于筛选下拉）。 */
    public record ModelOptionItem(String modelName, String provider) {
    }

    /** 通用选项项。 */
    public record OptionItem(String code, String label) {
    }

    /** 看板筛选项集合。 */
    public record ModelUsageOptions(List<ModelOptionItem> models,
                                    List<OptionItem> providers,
                                    List<OptionItem> agentTypes) {
    }

    /** 平台总览。 */
    public record ModelOverview(long totalCalls,
                                long successCount,
                                long failureCount,
                                double successRate,
                                long inputTokens,
                                long outputTokens,
                                long totalTokens,
                                double tokenCoverage,
                                double avgDurationMs,
                                long p95DurationMs,
                                long activeModelCount,
                                long distinctUsers, long cachedTokens, Double cacheHitRate) {
    }

    /**
     * 模型排行明细；{@code modelName} 是实际模型名，{@code modelConfigName} 用于排行展示配置名称。
     * 未绑定模型配置的系统调用该字段为空，由前端回退显示实际模型名。
     */
    public record ModelBreakdown(String modelName,
                                 String modelConfigName,
                                 String provider,
                                 Long modelConfigId,
                                 long total,
                                 long success,
                                 long failure,
                                 double successRate,
                                 long inputTokens,
                                 long outputTokens,
                                 long totalTokens,
                                 double avgDurationMs,
                                 long p95DurationMs,
                                 long cachedTokens, Double cacheHitRate) {
    }

    /**
     * 按用户聚合的 Token 用量明细；与模型明细分离，避免不同统计维度挤在同一张表中。
     */
    public record UserBreakdown(Long userId,
                                String username,
                                String nickname,
                                long total,
                                long inputTokens,
                                long outputTokens,
                                long totalTokens,
                                long cachedTokens,
                                Double cacheHitRate,
                                String lastInvokedAt) {
    }

    /** 调用趋势单点。 */
    public record ModelTrendPoint(String bucket,
                                  long total,
                                  long success,
                                  long failure,
                                  long totalTokens,
                                  double avgDurationMs, long cachedTokens, Double cacheHitRate) {
    }

    /** 按供应商聚合。 */
    public record ProviderBreakdown(String provider,
                                    long total,
                                    long success,
                                    long failure,
                                    double successRate,
                                    long totalTokens,
                                    double avgDurationMs, long cachedTokens, Double cacheHitRate) {
    }

    /** 按调用来源（智能体类型）聚合。 */
    public record SourceBreakdown(String agentType,
                                  String label,
                                  long total,
                                  long success,
                                  long failure,
                                  double successRate,
                                  long totalTokens,
                                  double avgDurationMs, long cachedTokens, Double cacheHitRate) {
    }
}
