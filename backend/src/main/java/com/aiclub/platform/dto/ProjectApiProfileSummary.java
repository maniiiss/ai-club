package com.aiclub.platform.dto;

/**
 * 项目级 API 文档元信息。
 */
public record ProjectApiProfileSummary(
        Long projectId,
        String title,
        String description,
        String version
) {
}
