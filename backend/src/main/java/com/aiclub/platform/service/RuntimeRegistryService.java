package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RuntimeRegistryEntity;
import com.aiclub.platform.dto.RuntimeRegistrySummary;
import com.aiclub.platform.dto.request.RuntimeRegistryRequest;
import com.aiclub.platform.repository.RuntimeRegistryRepository;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.aiclub.platform.runtime.RuntimeDescriptor;
import com.aiclub.platform.runtime.RuntimeHealth;
import com.aiclub.platform.runtime.RuntimeHealthStatus;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * Runtime 注册中心。
 * 所有执行入口都通过本服务解析能力和健康状态，避免业务代码散落 Runtime 字符串判断。
 */
@Service
@Transactional(readOnly = true)
public class RuntimeRegistryService {

    private final RuntimeRegistryRepository repository;
    private final ObjectMapper objectMapper;

    public RuntimeRegistryService(RuntimeRegistryRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public List<RuntimeRegistrySummary> list() {
        return repository.findAllByOrderByRuntimeCodeAsc().stream().map(this::toSummary).toList();
    }

    public RuntimeRegistryEntity require(String runtimeCode) {
        String normalized = normalizeCode(runtimeCode);
        return repository.findById(normalized)
                .orElseThrow(() -> new NoSuchElementException("Runtime 未注册: " + normalized));
    }

    public RuntimeDescriptor descriptor(String runtimeCode) {
        RuntimeRegistryEntity entity = require(runtimeCode);
        return new RuntimeDescriptor(
                entity.getRuntimeCode(),
                entity.getAdapterType(),
                entity.getEndpointRef(),
                entity.getVersion(),
                parseCapabilities(entity.getCapabilitiesJson()),
                entity.getSandboxPolicyJson()
        );
    }

    public boolean isAvailable(String runtimeCode, Set<RuntimeCapability> required) {
        RuntimeRegistryEntity entity = require(runtimeCode);
        // 新任务只能选择已启用且已经完成健康探测的 Runtime；UNKNOWN 不能被误当成可用。
        // DEGRADED 仍可作为受控降级候选，实际是否采用由能力和副作用保护共同决定。
        if (!entity.isEnabled() || (entity.getHealthStatus() != RuntimeHealthStatus.HEALTHY
                && entity.getHealthStatus() != RuntimeHealthStatus.DEGRADED)) {
            return false;
        }
        return descriptor(runtimeCode).capabilities().containsAll(required == null ? Set.of() : required);
    }

    @Transactional
    public RuntimeRegistrySummary save(@Valid RuntimeRegistryRequest request) {
        String runtimeCode = normalizeCode(request.runtimeCode());
        RuntimeRegistryEntity entity = repository.findById(runtimeCode).orElseGet(RuntimeRegistryEntity::new);
        entity.setRuntimeCode(runtimeCode);
        entity.setAdapterType(request.adapterType());
        entity.setEndpointRef(trimToNull(request.endpointRef()));
        entity.setVersion(hasText(request.version()) ? request.version().trim() : "unknown");
        entity.setCapabilitiesJson(writeList(normalizeCapabilities(request.capabilities())));
        entity.setSandboxPolicyJson(hasText(request.sandboxPolicyJson()) ? request.sandboxPolicyJson().trim() : "{}");
        entity.setFallbackRuntimeCodesJson(writeList(normalizeCodes(request.fallbackRuntimeCodes())));
        if (request.enabled() != null) entity.setEnabled(request.enabled());
        if (!entity.isEnabled()) entity.setHealthStatus(RuntimeHealthStatus.DISABLED);
        return toSummary(repository.save(entity));
    }

    @Transactional
    public RuntimeRegistrySummary setEnabled(String runtimeCode, boolean enabled) {
        RuntimeRegistryEntity entity = require(runtimeCode);
        entity.setEnabled(enabled);
        entity.setHealthStatus(enabled ? RuntimeHealthStatus.UNKNOWN : RuntimeHealthStatus.DISABLED);
        entity.setHealthMessage(enabled ? "等待健康检查" : "已由平台管理员禁用");
        entity.setHealthCheckedAt(LocalDateTime.now());
        return toSummary(repository.save(entity));
    }

    @Transactional
    public RuntimeRegistrySummary recordHealth(RuntimeHealth health) {
        RuntimeRegistryEntity entity = require(health.runtimeCode());
        entity.setHealthStatus(entity.isEnabled() ? health.status() : RuntimeHealthStatus.DISABLED);
        entity.setHealthMessage(health.message() == null ? "" : health.message());
        entity.setHealthCheckedAt(health.checkedAt() == null ? LocalDateTime.now() : health.checkedAt());
        return toSummary(repository.save(entity));
    }

    private RuntimeRegistrySummary toSummary(RuntimeRegistryEntity entity) {
        return new RuntimeRegistrySummary(
                entity.getRuntimeCode(), entity.getAdapterType(), entity.getEndpointRef(), entity.getVersion(),
                parseCapabilities(entity.getCapabilitiesJson()).stream().map(Enum::name).toList(),
                entity.getSandboxPolicyJson(), parseStringList(entity.getFallbackRuntimeCodesJson()),
                entity.getHealthStatus(), entity.getHealthMessage(), entity.getHealthCheckedAt(), entity.isEnabled()
        );
    }

    private Set<RuntimeCapability> parseCapabilities(String json) {
        return parseStringList(json).stream().map(RuntimeCapability::from)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
    }

    private List<String> parseStringList(String json) {
        if (!hasText(json)) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (Exception exception) {
            throw new IllegalStateException("Runtime 注册项 JSON 配置损坏", exception);
        }
    }

    private List<String> normalizeCapabilities(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(this::hasText).map(value -> RuntimeCapability.from(value).name()).distinct().toList();
    }

    private List<String> normalizeCodes(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(this::hasText).map(this::normalizeCode).distinct().toList();
    }

    private String writeList(List<String> values) {
        try { return objectMapper.writeValueAsString(values == null ? List.of() : values); }
        catch (Exception exception) { throw new IllegalStateException("Runtime 注册项列表序列化失败", exception); }
    }

    private String normalizeCode(String value) {
        if (!hasText(value)) throw new IllegalArgumentException("Runtime code is required");
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) { return hasText(value) ? value.trim() : null; }
    private boolean hasText(String value) { return value != null && !value.isBlank(); }
}
