package com.aiclub.platform.dto.apistudio;

import java.util.List;

/**
 * 原生 API 工作台 - 单个响应定义（含字段树）。
 */
public record ApiStudioResponseItem(
        Long id,
        Integer statusCode,
        String contentType,
        String description,
        String exampleBody,
        Integer sortOrder,
        List<ApiStudioResponseFieldItem> fields
) {
}
