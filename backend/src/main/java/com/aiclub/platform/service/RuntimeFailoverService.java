package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeCapability;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 受控 Runtime 降级选择器。
 * 一旦产生工具副作用或进入人工确认，调用方必须传入 sideEffectStarted=true，选择器只返回主 Runtime。
 */
@Service
public class RuntimeFailoverService {

    private final RuntimeRegistryService registryService;
    private final ObjectMapper objectMapper;

    public RuntimeFailoverService(RuntimeRegistryService registryService, ObjectMapper objectMapper) {
        this.registryService = registryService;
        this.objectMapper = objectMapper;
    }

    public List<String> candidates(String primaryRuntimeCode,
                                   String profileFallbackCodesJson,
                                   Set<RuntimeCapability> requiredCapabilities,
                                   boolean sideEffectStarted) {
        String primary = normalize(primaryRuntimeCode);
        if (sideEffectStarted) return List.of(primary);
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        candidates.add(primary);
        for (String code : parseCodes(profileFallbackCodesJson)) candidates.add(code);
        return candidates.stream()
                .filter(code -> {
                    try { return registryService.isAvailable(code, requiredCapabilities); }
                    catch (RuntimeException ignored) { return false; }
                })
                .toList();
    }

    private List<String> parseCodes(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, new TypeReference<List<String>>() {})
                    .stream().filter(item -> item != null && !item.isBlank()).map(this::normalize).toList();
        } catch (Exception exception) {
            throw new IllegalArgumentException("Runtime 降级配置不是合法 JSON 数组", exception);
        }
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Runtime code is required");
        return value.trim().toUpperCase(java.util.Locale.ROOT);
    }
}
