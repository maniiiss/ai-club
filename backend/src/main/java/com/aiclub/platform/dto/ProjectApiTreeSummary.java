package com.aiclub.platform.dto;

import java.util.List;

/**
 * 项目级 API 目录树快照。
 */
public record ProjectApiTreeSummary(
        List<ProjectApiFolderTreeNodeSummary> folders,
        List<ProjectApiEndpointSummary> rootEndpoints
) {
}
