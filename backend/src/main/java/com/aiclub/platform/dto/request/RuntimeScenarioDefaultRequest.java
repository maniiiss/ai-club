package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 更新平台场景默认 Runtime 的请求。 */
public record RuntimeScenarioDefaultRequest(
        @NotBlank @Size(max = 40) String runtimeRegistryCode
) {
}
