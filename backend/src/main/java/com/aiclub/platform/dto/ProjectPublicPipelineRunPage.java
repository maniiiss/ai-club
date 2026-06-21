package com.aiclub.platform.dto;

/**
 * 项目只读分享页：单条流水线的运行历史分页结果。
 *
 * <p>{@code projectId / projectName} 用于公开页 hero 区域显示，
 * {@code pipelineKind / pipelineId / pipelineName} 用于回显当前选中的流水线，
 * {@code runs} 是脱敏后的分页数据。</p>
 *
 * <p>当外部 CI 服务（如 Jenkins）调用失败时，service 层会返回空 {@code runs}
 * 并通过 {@code warning} 提示原因，避免一次外部故障拖垮整个分享页。</p>
 */
public record ProjectPublicPipelineRunPage(
        Long projectId,
        String projectName,
        String pipelineKind,
        Long pipelineId,
        String pipelineName,
        PageResponse<ProjectPublicPipelineRunSummary> runs,
        String warning
) {
}
