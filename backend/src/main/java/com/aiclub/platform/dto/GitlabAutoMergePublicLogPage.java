package com.aiclub.platform.dto;

/**
 * 匿名只读分享页的项目级自动合并日志数据。
 *
 * <p>{@code nextMergeAt} 为该项目下所有「启用了定时调度」的 PROJECT_BOUND 自动合并策略中，
 * 最近一次即将触发的时间（已格式化字符串）；没有启用调度时为 {@code null}。</p>
 */
public record GitlabAutoMergePublicLogPage(
        Long projectId,
        String projectName,
        String nextMergeAt,
        PageResponse<GitlabAutoMergeLogSummary> logs
) {
}
