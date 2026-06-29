package com.aiclub.platform.dto.apistudio;

/**
 * 原生 API 工作台 - API 参数。
 */
public record ApiStudioEndpointParameterItem(
        Long id,
        String location,
        String name,
        String dataType,
        Boolean required,
        String defaultValue,
        String exampleValue,
        String description,
        String enumJson,
        Integer sortOrder
) {
}
