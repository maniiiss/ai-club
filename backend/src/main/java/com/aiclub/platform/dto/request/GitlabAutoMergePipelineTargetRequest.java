package com.aiclub.platform.dto.request;

/**
 * GitLab 自动合并成功后要触发的目标流水线。
 */
public record GitlabAutoMergePipelineTargetRequest(
        String targetType,
        Long targetId
) {
}
