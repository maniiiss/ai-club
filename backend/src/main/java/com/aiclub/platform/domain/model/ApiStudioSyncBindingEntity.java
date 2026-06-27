package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 同步来源绑定。
 * 标记某个 endpoint 是由哪个外部数据源（如 GitLab Spring 接口抽取）同步生成的，
 * 承担旧 Yaade data.aiclubSync marker 的幂等/区分作用，使主表保持纯净。
 */
@Entity
@Table(name = "api_studio_sync_binding")
public class ApiStudioSyncBindingEntity {

    public static final String SOURCE_TYPE_GITLAB_SPRING_API = "GITLAB_SPRING_API";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "endpoint_id", nullable = false)
    private Long endpointId;

    @Column(name = "source_type", nullable = false, length = 30)
    private String sourceType;

    @Column(name = "source_binding_id", nullable = false)
    private Long sourceBindingId;

    @Column(nullable = false, length = 255)
    private String branch;

    @Column(name = "source_signature", length = 512)
    private String sourceSignature;

    @Column(name = "last_synced_at", nullable = false)
    private LocalDateTime lastSyncedAt = LocalDateTime.now();

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEndpointId() { return endpointId; }
    public void setEndpointId(Long endpointId) { this.endpointId = endpointId; }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public Long getSourceBindingId() { return sourceBindingId; }
    public void setSourceBindingId(Long sourceBindingId) { this.sourceBindingId = sourceBindingId; }

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }

    public String getSourceSignature() { return sourceSignature; }
    public void setSourceSignature(String sourceSignature) { this.sourceSignature = sourceSignature; }

    public LocalDateTime getLastSyncedAt() { return lastSyncedAt; }
    public void setLastSyncedAt(LocalDateTime lastSyncedAt) { this.lastSyncedAt = lastSyncedAt; }
}
