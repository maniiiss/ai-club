package com.aiclub.platform.dto;

/** 桌面发布产物摘要，不暴露 MinIO 对象键。 */
public record DesktopReleaseArtifactSummary(
        Long id,
        String artifactKind,
        String platform,
        String arch,
        String bundleType,
        String fileName,
        String contentType,
        long fileSize,
        String sha256,
        String downloadStatus,
        String downloadUrl
) {
}
