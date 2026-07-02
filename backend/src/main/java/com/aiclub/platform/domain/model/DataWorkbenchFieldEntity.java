package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * DataWorkbench 字段配置。
 * 业务意图：把字段展示名、同义词、物理列、定位/可修改/敏感属性集中维护，避免模型直接猜列名。
 */
@Entity
@Table(name = "data_workbench_field")
public class DataWorkbenchFieldEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属业务实体。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id", nullable = false)
    private DataWorkbenchEntity entity;

    /**
     * 字段编码，供 DSL 引用。
     */
    @Column(name = "field_code", nullable = false, length = 80)
    private String fieldCode;

    /**
     * 字段展示名称。
     */
    @Column(name = "field_name", nullable = false, length = 120)
    private String fieldName;

    /**
     * 物理列名。
     */
    @Column(name = "column_name", nullable = false, length = 80)
    private String columnName;

    /**
     * 字段类型，用于值转换和前端提示。
     */
    @Column(name = "data_type", nullable = false, length = 40)
    private String dataType = "STRING";

    /**
     * 中文/业务同义词，逗号分隔。
     */
    @Column(nullable = false, length = 1000)
    private String synonyms = "";

    /**
     * 是否允许被 DataChange 修改。
     */
    @Column(nullable = false)
    private boolean updatable = false;

    /**
     * 是否允许作为定位条件。
     */
    @Column(nullable = false)
    private boolean locator = false;

    /**
     * 敏感字段默认进入高风险审批。
     */
    @Column(nullable = false)
    private boolean sensitive = false;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public DataWorkbenchEntity getEntity() {
        return entity;
    }

    public void setEntity(DataWorkbenchEntity entity) {
        this.entity = entity;
    }

    public String getFieldCode() {
        return fieldCode;
    }

    public void setFieldCode(String fieldCode) {
        this.fieldCode = fieldCode;
    }

    public String getFieldName() {
        return fieldName;
    }

    public void setFieldName(String fieldName) {
        this.fieldName = fieldName;
    }

    public String getColumnName() {
        return columnName;
    }

    public void setColumnName(String columnName) {
        this.columnName = columnName;
    }

    public String getDataType() {
        return dataType;
    }

    public void setDataType(String dataType) {
        this.dataType = dataType;
    }

    public String getSynonyms() {
        return synonyms;
    }

    public void setSynonyms(String synonyms) {
        this.synonyms = synonyms;
    }

    public boolean isUpdatable() {
        return updatable;
    }

    public void setUpdatable(boolean updatable) {
        this.updatable = updatable;
    }

    public boolean isLocator() {
        return locator;
    }

    public void setLocator(boolean locator) {
        this.locator = locator;
    }

    public boolean isSensitive() {
        return sensitive;
    }

    public void setSensitive(boolean sensitive) {
        this.sensitive = sensitive;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }
}
