package com.aiclub.platform.dto;

import java.util.List;

/**
 * API 目录树节点。
 */
public record ProjectApiFolderTreeNodeSummary(
        Long id,
        String name,
        Integer sortOrder,
        List<ProjectApiFolderTreeNodeSummary> children,
        List<ProjectApiEndpointSummary> endpoints
) {
}
