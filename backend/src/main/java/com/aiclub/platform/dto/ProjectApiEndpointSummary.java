package com.aiclub.platform.dto;

/**
 * API 接口树中的叶子节点摘要。
 */
public record ProjectApiEndpointSummary(
        Long id,
        Long folderId,
        String name,
        String method,
        String path,
        String summary
) {
}
