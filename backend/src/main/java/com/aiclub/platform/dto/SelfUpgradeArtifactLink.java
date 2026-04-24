package com.aiclub.platform.dto;

/**
 * 巡检与建议详情里统一使用的产物引用。
 */
public record SelfUpgradeArtifactLink(
        Long executionArtifactId,
        String artifactType,
        String title,
        String contentRef,
        String previewText,
        String downloadUrl
) {
}
