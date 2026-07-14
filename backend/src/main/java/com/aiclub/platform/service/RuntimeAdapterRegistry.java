package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeAdapter;
import com.aiclub.platform.runtime.HttpRuntimeAdapter;
import com.aiclub.platform.runtime.RuntimeDescriptor;
import com.aiclub.platform.runtime.RuntimeHealth;
import com.aiclub.platform.runtime.RuntimeHealthStatus;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runtime Adapter 注册门面。
 * 适配器实例按 Runtime 编码缓存，调用方只依赖统一接口；现有 CLI/Assistant 调用实现仍在兼容迁移期内复用。
 */
@Service
public class RuntimeAdapterRegistry {

    private final RuntimeRegistryService registryService;
    private final Map<String, RuntimeAdapter> adapters = new ConcurrentHashMap<>();

    private final InternalServiceAuthenticator authenticator;
    private final ObjectMapper objectMapper;
    private final String piRuntimeBaseUrl;
    private final String codeProcessingBaseUrl;

    @Autowired
    public RuntimeAdapterRegistry(RuntimeRegistryService registryService,
                                  InternalServiceAuthenticator authenticator,
                                  ObjectMapper objectMapper,
                                  @Value("${platform.pi-runtime.base-url:http://localhost:9010}") String piRuntimeBaseUrl,
                                  @Value("${platform.code-processing.base-url:http://localhost:9000}") String codeProcessingBaseUrl) {
        this.registryService = registryService;
        this.authenticator = authenticator;
        this.objectMapper = objectMapper;
        this.piRuntimeBaseUrl = piRuntimeBaseUrl;
        this.codeProcessingBaseUrl = codeProcessingBaseUrl;
    }

    public RuntimeAdapter require(String runtimeCode) {
        String normalized = runtimeCode == null ? "" : runtimeCode.trim().toUpperCase(java.util.Locale.ROOT);
        return adapters.computeIfAbsent(normalized, ignored -> new HttpRuntimeAdapter(
                registryService, normalized, piRuntimeBaseUrl, codeProcessingBaseUrl, authenticator, objectMapper));
    }
}
