package com.aiclub.platform.dto.apistudio;

import java.util.List;

/**
 * 原生 API 工作台 - 整个项目的目录+API 树。
 * rootEndpoints 表示未挂载到目录、直接挂在项目根级的 API。
 */
public record ApiStudioProjectTree(
        Long projectId,
        List<ApiStudioTreeNode> nodes,
        List<ApiStudioEndpointSummary> rootEndpoints
) {
}
