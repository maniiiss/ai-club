package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

public record ProjectApiKeyValueItemRequest(
        @Size(max = 200, message = "键名长度不能超过200")
        String name,
        @Size(max = 5000, message = "键值长度不能超过5000")
        String value,
        Boolean enabled
) {
}
