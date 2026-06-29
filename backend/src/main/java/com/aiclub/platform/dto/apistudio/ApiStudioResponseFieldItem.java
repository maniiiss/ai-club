package com.aiclub.platform.dto.apistudio;

import java.util.List;

/**
 * 原生 API 工作台 - 响应字段（递归树）。
 */
public record ApiStudioResponseFieldItem(
        Long id,
        Long parentId,
        String name,
        String dataType,
        Boolean required,
        String description,
        String exampleValue,
        String enumJson,
        Integer sortOrder,
        List<ApiStudioResponseFieldItem> children
) {
}
