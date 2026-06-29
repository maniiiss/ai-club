package com.aiclub.platform.dto.request.apistudio;

/**
 * 创建/编辑 API 参数 Payload。
 */
public record ApiStudioParameterPayload(
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
