package com.aiclub.platform.dto.apistudio;

import java.util.List;

/**
 * 原生 API 工作台 - 目录树节点（含子目录和当前目录下的 API）。
 */
public record ApiStudioTreeNode(
        ApiStudioDirectorySummary directory,
        List<ApiStudioTreeNode> children,
        List<ApiStudioEndpointSummary> endpoints
) {
}
