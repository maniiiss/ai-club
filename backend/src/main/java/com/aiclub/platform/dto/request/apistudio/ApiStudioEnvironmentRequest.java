package com.aiclub.platform.dto.request.apistudio;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 创建/编辑环境请求。
 */
public record ApiStudioEnvironmentRequest(
        @NotBlank @Size(max = 128) String name,
        @NotBlank String baseUrl,
        String commonHeadersJson,
        String authType,
        String authConfigJson,
        Boolean isDefault,
        List<ApiStudioVariablePayload> variables
) {
}
