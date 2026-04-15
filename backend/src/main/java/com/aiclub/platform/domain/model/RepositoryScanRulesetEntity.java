package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 仓库扫描规则集实体。
 * 用于持久化管理后台可维护的多份扫描规则集配置。
 */
@Entity
@Table(name = "repository_scan_ruleset")
public class RepositoryScanRulesetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 规则集唯一编码。
     * 创建后不允许修改，供执行任务和 Hermes 工具链稳定引用。
     */
    @Column(nullable = false, unique = true, length = 100)
    private String code;

    /**
     * 规则集展示名称。
     */
    @Column(nullable = false, length = 120)
    private String name;

    /**
     * 规则集说明。
     */
    @Column(nullable = false, length = 500)
    private String description = "";

    /**
     * 扫描引擎类型。
     * 第一版仅支持 SEMGREP，但保留字段为未来扩展多引擎做准备。
     */
    @Column(name = "engine_type", nullable = false, length = 30)
    private String engineType;

    /**
     * 是否启用。
     */
    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /**
     * 是否为系统默认规则集。
     * 平台保证同一时刻只会有一条默认规则集。
     */
    @Column(name = "default_selected", nullable = false)
    private Boolean defaultSelected = Boolean.FALSE;

    /**
     * 规则集原始定义内容。
     * 第一版存储 Semgrep YAML 正文。
     */
    @Column(name = "definition_content", nullable = false, columnDefinition = "TEXT")
    private String definitionContent = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getEngineType() {
        return engineType;
    }

    public void setEngineType(String engineType) {
        this.engineType = engineType;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Boolean getDefaultSelected() {
        return defaultSelected;
    }

    public void setDefaultSelected(Boolean defaultSelected) {
        this.defaultSelected = defaultSelected;
    }

    public String getDefinitionContent() {
        return definitionContent;
    }

    public void setDefinitionContent(String definitionContent) {
        this.definitionContent = definitionContent;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
