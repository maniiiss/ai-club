package com.aiclub.platform.dto.request;

/**
 * runner 完成后要补录的产物信息。
 * 主要用于完整日志对象键与日志预览文本的回传。
 */
public record ExecutionSessionArtifactRequest(
        String artifactType,
        String title,
        String contentRef,
        String contentText
) {
}
