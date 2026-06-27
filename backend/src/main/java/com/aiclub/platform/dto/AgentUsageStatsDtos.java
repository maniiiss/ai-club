package com.aiclub.platform.dto;

import java.util.List;

/**
 * 智能体调用统计相关的 DTO 集合。
 *
 * <p>使用嵌套 record 集中暴露给 {@code AgentUsageStatsController} 和前端。
 */
public final class AgentUsageStatsDtos {

    private AgentUsageStatsDtos() {
    }

    /**
     * 查询入参。
     *
     * <p>{@code startTime / endTime} 使用字符串格式（{@code yyyy-MM-dd HH:mm:ss}），与平台前端
     * Element Plus datetimerange 的 value-format 对齐。Service 层负责解析与时间窗校验。
     */
    public record AgentUsageQueryRequest(
            String startTime,
            String endTime,
            List<String> agentTypes,
            List<Long> userIds,
            List<Long> modelConfigIds,
            List<String> triggerSources,
            Long projectId,
            String granularity,
            Integer limit,
            Integer page,
            Integer size
    ) {
        public AgentUsageQueryRequest {
            // 兜底默认值在 service 层处理
        }
    }

    /**
     * 选项接口返回值，含枚举码及中文名。
     */
    public record OptionItem(String code, String label) {
    }

    public record AgentUsageOptions(
            List<OptionItem> agentTypes,
            List<OptionItem> statuses,
            List<OptionItem> triggerSources
    ) {
    }

    /**
     * 总览指标。
     */
    public record AgentUsageOverview(
            long totalCount,
            long successCount,
            long failureCount,
            double successRate,
            long totalPromptTokens,
            long totalCompletionTokens,
            long totalTotalTokens,
            double tokenCoverageRatio,
            double avgDurationMs,
            long p95DurationMs,
            long distinctUserCount,
            long unknownCallCount,
            List<UnknownCallSource> unknownCallSources
    ) {
    }

    /**
     * UNKNOWN 来源（用于看板告警横幅）。
     */
    public record UnknownCallSource(String source, long count) {
    }

    /**
     * 趋势点。
     */
    public record AgentUsageTrendPoint(
            String bucket,
            long total,
            long success,
            long failure,
            long totalTokens,
            double avgDurationMs
    ) {
    }

    /**
     * 按智能体聚合行。
     */
    public record AgentUsageAgentBreakdown(
            String agentType,
            String agentLabel,
            long total,
            long success,
            long failure,
            double successRate,
            double avgDurationMs,
            long totalTokens
    ) {
    }

    /**
     * 按用户聚合行。
     */
    public record AgentUsageUserBreakdown(
            Long userId,
            String username,
            String nickname,
            long total,
            long success,
            long totalTokens,
            String lastInvokedAt
    ) {
    }

    /**
     * 按模型聚合行。
     */
    public record AgentUsageModelBreakdown(
            Long modelConfigId,
            String modelName,
            String provider,
            long total,
            long totalTokens,
            double avgDurationMs,
            long p95DurationMs
    ) {
    }

    /**
     * 调用明细行。
     */
    public record AgentInvocationLogSummary(
            Long id,
            String createdAt,
            Long userId,
            String username,
            String nickname,
            String agentType,
            String agentLabel,
            String action,
            String modelName,
            String provider,
            String status,
            String triggerSource,
            Long durationMs,
            Integer promptTokens,
            Integer completionTokens,
            Integer totalTokens,
            Integer inputChars,
            Integer outputChars,
            String errorCode,
            String errorMessage
    ) {
    }
}