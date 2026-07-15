package com.aiclub.platform.domain.model;

import com.aiclub.platform.runtime.RuntimeAdapterType;
import com.aiclub.platform.runtime.RuntimeHealthStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 平台 Runtime 注册项。
 * endpointRef、能力、沙箱和降级策略统一由平台维护，Agent 不再直接持有任意 Gateway 地址。
 */
@Entity
@Table(name = "runtime_registry")
public class RuntimeRegistryEntity {

    @Id
    @Column(name = "runtime_code", length = 40)
    private String runtimeCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "adapter_type", nullable = false, length = 30)
    private RuntimeAdapterType adapterType;

    @Column(name = "endpoint_ref", length = 200)
    private String endpointRef;

    @Column(name = "version", nullable = false, length = 100)
    private String version = "unknown";

    @Column(name = "capabilities_json", nullable = false, columnDefinition = "TEXT")
    private String capabilitiesJson = "[]";

    @Column(name = "sandbox_policy_json", nullable = false, columnDefinition = "TEXT")
    private String sandboxPolicyJson = "{}";

    @Column(name = "fallback_runtime_codes_json", nullable = false, columnDefinition = "TEXT")
    private String fallbackRuntimeCodesJson = "[]";

    /** 管理端配置的 Runtime 上下文窗口大小，单位为 token。 */
    @Column(name = "context_window_tokens", nullable = false)
    private Integer contextWindowTokens = 128_000;

    /** 管理端为模型输出预留的 token 数。 */
    @Column(name = "max_output_tokens", nullable = false)
    private Integer maxOutputTokens = 8_192;

    /** 达到该上下文使用比例后触发压缩。 */
    @Column(name = "compaction_threshold_percent", nullable = false)
    private Integer compactionThresholdPercent = 80;

    /** Runtime 原生压缩与 backend 兜底的组合策略。 */
    @Column(name = "compaction_strategy", nullable = false, length = 30)
    private String compactionStrategy = "NATIVE_FIRST";

    @Enumerated(EnumType.STRING)
    @Column(name = "health_status", nullable = false, length = 20)
    private RuntimeHealthStatus healthStatus = RuntimeHealthStatus.UNKNOWN;

    @Column(name = "health_message", nullable = false, length = 1000)
    private String healthMessage = "";

    @Column(name = "health_checked_at")
    private LocalDateTime healthCheckedAt;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getRuntimeCode() { return runtimeCode; }
    public void setRuntimeCode(String runtimeCode) { this.runtimeCode = runtimeCode; }
    public RuntimeAdapterType getAdapterType() { return adapterType; }
    public void setAdapterType(RuntimeAdapterType adapterType) { this.adapterType = adapterType; }
    public String getEndpointRef() { return endpointRef; }
    public void setEndpointRef(String endpointRef) { this.endpointRef = endpointRef; }
    public String getVersion() { return version; }
    public void setVersion(String version) { this.version = version; }
    public String getCapabilitiesJson() { return capabilitiesJson; }
    public void setCapabilitiesJson(String capabilitiesJson) { this.capabilitiesJson = capabilitiesJson; }
    public String getSandboxPolicyJson() { return sandboxPolicyJson; }
    public void setSandboxPolicyJson(String sandboxPolicyJson) { this.sandboxPolicyJson = sandboxPolicyJson; }
    public String getFallbackRuntimeCodesJson() { return fallbackRuntimeCodesJson; }
    public void setFallbackRuntimeCodesJson(String fallbackRuntimeCodesJson) { this.fallbackRuntimeCodesJson = fallbackRuntimeCodesJson; }
    public Integer getContextWindowTokens() { return contextWindowTokens; }
    public void setContextWindowTokens(Integer contextWindowTokens) { this.contextWindowTokens = contextWindowTokens; }
    public Integer getMaxOutputTokens() { return maxOutputTokens; }
    public void setMaxOutputTokens(Integer maxOutputTokens) { this.maxOutputTokens = maxOutputTokens; }
    public Integer getCompactionThresholdPercent() { return compactionThresholdPercent; }
    public void setCompactionThresholdPercent(Integer compactionThresholdPercent) { this.compactionThresholdPercent = compactionThresholdPercent; }
    public String getCompactionStrategy() { return compactionStrategy; }
    public void setCompactionStrategy(String compactionStrategy) { this.compactionStrategy = compactionStrategy; }
    public RuntimeHealthStatus getHealthStatus() { return healthStatus; }
    public void setHealthStatus(RuntimeHealthStatus healthStatus) { this.healthStatus = healthStatus; }
    public String getHealthMessage() { return healthMessage; }
    public void setHealthMessage(String healthMessage) { this.healthMessage = healthMessage; }
    public LocalDateTime getHealthCheckedAt() { return healthCheckedAt; }
    public void setHealthCheckedAt(LocalDateTime healthCheckedAt) { this.healthCheckedAt = healthCheckedAt; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
