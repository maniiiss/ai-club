package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 平台业务场景的默认 Runtime 绑定。
 * 业务意图：把助手、聊天室和执行中心的默认路由集中交给 Runtime 管理员维护，避免各入口各自读取环境变量或硬编码。
 */
@Entity
@Table(name = "runtime_scenario_default")
public class RuntimeScenarioDefaultEntity {

    @Id
    @Column(name = "scenario_code", length = 50)
    private String scenarioCode;

    @Column(name = "runtime_registry_code", nullable = false, length = 40)
    private String runtimeRegistryCode;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getScenarioCode() { return scenarioCode; }
    public void setScenarioCode(String scenarioCode) { this.scenarioCode = scenarioCode; }
    public String getRuntimeRegistryCode() { return runtimeRegistryCode; }
    public void setRuntimeRegistryCode(String runtimeRegistryCode) { this.runtimeRegistryCode = runtimeRegistryCode; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
