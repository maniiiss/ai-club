package com.aiclub.platform.runtime;

import java.util.Set;

/**
 * Runtime 对平台控制面的能力声明。
 * endpointRef 是受控部署引用，不允许直接作为任意远端地址使用。
 */
public record RuntimeDescriptor(
        String runtimeCode,
        RuntimeAdapterType adapterType,
        String endpointRef,
        String version,
        Set<RuntimeCapability> capabilities,
        String sandboxPolicyJson
) {
    public RuntimeDescriptor {
        if (runtimeCode == null || runtimeCode.isBlank()) {
            throw new IllegalArgumentException("Runtime code is required");
        }
        capabilities = capabilities == null ? Set.of() : Set.copyOf(capabilities);
    }

    public boolean supports(RuntimeCapability capability) {
        return capability != null && capabilities.contains(capability);
    }
}
