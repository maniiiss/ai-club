package com.aiclub.platform.dto.request.apistudio;

import java.util.List;

/**
 * 创建/编辑响应字段 Payload（递归）。
 */
public record ApiStudioResponseFieldPayload(
        Long id,
        String name,
        String dataType,
        Boolean required,
        String description,
        String exampleValue,
        String enumJson,
        Integer sortOrder,
        List<ApiStudioResponseFieldPayload> children
) {
}
