package com.aiclub.platform.dto.request.apistudio;

import java.util.List;

/**
 * 创建/编辑响应 Payload。
 */
public record ApiStudioResponsePayload(
        Long id,
        Integer statusCode,
        String contentType,
        String description,
        String exampleBody,
        Integer sortOrder,
        List<ApiStudioResponseFieldPayload> fields
) {
}
