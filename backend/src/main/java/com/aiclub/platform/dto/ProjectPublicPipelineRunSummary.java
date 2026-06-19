package com.aiclub.platform.dto;

/**
 * 项目只读分享页对外暴露的单次流水线运行摘要。
 *
 * <p>仅展示六类非敏感字段，不返回触发者邮箱、提交信息、控制台日志等内容；
 * Woodpecker 与 Jenkins 两类来源会在 service 层映射到本结构。</p>
 */
public record ProjectPublicPipelineRunSummary(
        Integer runNumber,
        String status,
        String branch,
        String event,
        String triggeredAt,
        String runUrl
) {
}
