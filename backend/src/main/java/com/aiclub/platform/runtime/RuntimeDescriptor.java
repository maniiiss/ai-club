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
        String sandboxPolicyJson,
        RuntimeContextProfile contextProfile
) {
    /** 兼容旧 Runtime 注册测试和适配器调用方，未提供上下文配置时使用平台默认值。 */
    public RuntimeDescriptor(String runtimeCode,
                             RuntimeAdapterType adapterType,
                             String endpointRef,
                             String version,
                             Set<RuntimeCapability> capabilities,
                             String sandboxPolicyJson) {
        this(runtimeCode, adapterType, endpointRef, version, capabilities, sandboxPolicyJson,
                RuntimeContextProfile.defaults());
    }

    public RuntimeDescriptor {
        if (runtimeCode == null || runtimeCode.isBlank()) {
            throw new IllegalArgumentException("Runtime code is required");
        }
        capabilities = capabilities == null ? Set.of() : Set.copyOf(capabilities);
        sandboxPolicyJson = sandboxPolicyJson == null ? "{}" : sandboxPolicyJson;
        contextProfile = contextProfile == null ? RuntimeContextProfile.defaults() : contextProfile;
    }

    public boolean supports(RuntimeCapability capability) {
        return capability != null && capabilities.contains(capability);
    }
}
