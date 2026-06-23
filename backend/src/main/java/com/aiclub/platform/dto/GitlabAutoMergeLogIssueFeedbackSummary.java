package com.aiclub.platform.dto;

/**
 * 自动合并日志逐条 issue 反馈的对外摘要。
 *
 * <p>分享页详情对话框打开时回显当前访问者已有的反馈，列表页轻量回填用。</p>
 */
public record GitlabAutoMergeLogIssueFeedbackSummary(
        Long id,
        Long logId,
        String issueId,
        String issueTextSnapshot,
        String section,
        String verdict,
        String reason,
        String createdAt,
        String updatedAt
) {
}
