package com.aiclub.platform.dto.request;

import com.aiclub.platform.runtime.RuntimeAdapterType;
import com.aiclub.platform.runtime.CompactionStrategy;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** Runtime 注册项维护请求；endpointRef 只能填写平台部署引用，不接受任意 URL。 */
public record RuntimeRegistryRequest(
        @NotBlank @Size(max = 40) String runtimeCode,
        @NotNull RuntimeAdapterType adapterType,
        @Size(max = 200) String endpointRef,
        @Size(max = 100) String version,
        List<String> capabilities,
        @Size(max = 20000) String sandboxPolicyJson,
        List<String> fallbackRuntimeCodes,
        Integer contextWindowTokens,
        Integer maxOutputTokens,
        Integer compactionThresholdPercent,
        CompactionStrategy compactionStrategy,
        Boolean enabled
) {
}
