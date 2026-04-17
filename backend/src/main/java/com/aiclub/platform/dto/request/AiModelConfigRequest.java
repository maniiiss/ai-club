package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiModelConfigRequest(
        @NotBlank(message = "模型名称不能为空")
        @Size(max = 120, message = "模型名称长度不能超过120")
        String name,
        /**
         * 模型用途类型，区分对话模型与 Embedding 模型，旧调用未传时默认回退为 CHAT。
         */
        @Size(max = 30, message = "模型类型长度不能超过30")
        String modelType,
        @NotBlank(message = "提供商不能为空")
        @Size(max = 30, message = "提供商长度不能超过30")
        String provider,
        @Size(max = 255, message = "API 地址长度不能超过255")
        String apiBaseUrl,
        @NotBlank(message = "模型标识不能为空")
        @Size(max = 120, message = "模型标识长度不能超过120")
        String modelName,
        @Size(max = 500, message = "API Key 长度不能超过500")
        String apiKey,
        @Size(max = 500, message = "描述长度不能超过500")
        String description,
        Boolean enabled
) {
}
