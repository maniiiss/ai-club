package com.aiclub.platform.domain.model;

import com.aiclub.platform.common.DataPermissionScopeType;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * DataWorkbench 业务实体配置。
 * 业务意图：用可维护的白名单描述业务实体到物理表的映射，DataChange 只能在这些配置内生成 SQL。
 */
@Entity
@Table(name = "data_workbench_entity")
public class DataWorkbenchEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 业务实体编码，供 DSL 引用。
     */
    @Column(name = "entity_code", nullable = false, unique = true, length = 80)
    private String entityCode;

    /**
     * 业务实体展示名称。
     */
    @Column(name = "entity_name", nullable = false, length = 120)
    private String entityName;

    @Column(nullable = false, length = 1000)
    private String description = "";

    /**
     * 允许更新的物理表名。
     */
    @Column(name = "table_name", nullable = false, length = 120)
    private String tableName;

    /**
     * 主键列名，用于快照、行锁和回滚。
     */
    @Column(name = "primary_key_column", nullable = false, length = 80)
    private String primaryKeyColumn = "id";

    /**
     * 项目列名，所有 DataChange 都必须带上该列条件。
     */
    @Column(name = "project_id_column", nullable = false, length = 80)
    private String projectIdColumn;

    /**
     * 单次允许影响的最大行数。
     */
    @Column(name = "max_affected_rows", nullable = false)
    private Integer maxAffectedRows = 1;

    /**
     * 项目内提交请求所需的数据权限范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "request_scope", nullable = false, length = 30)
    private DataPermissionScopeType requestScope = DataPermissionScopeType.PROJECT_PARTICIPANT;

    /**
     * 管理端执行请求所需的数据权限范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "execute_scope", nullable = false, length = 30)
    private DataPermissionScopeType executeScope = DataPermissionScopeType.OWNER_OR_CREATOR;

    /**
     * 管理端回滚请求所需的数据权限范围。
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "rollback_scope", nullable = false, length = 30)
    private DataPermissionScopeType rollbackScope = DataPermissionScopeType.OWNER_OR_CREATOR;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * 字段白名单配置。
     */
    @OneToMany(mappedBy = "entity", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<DataWorkbenchFieldEntity> fields = new ArrayList<>();

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

    public String getEntityCode() {
        return entityCode;
    }

    public void setEntityCode(String entityCode) {
        this.entityCode = entityCode;
    }

    public String getEntityName() {
        return entityName;
    }

    public void setEntityName(String entityName) {
        this.entityName = entityName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getTableName() {
        return tableName;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    public String getPrimaryKeyColumn() {
        return primaryKeyColumn;
    }

    public void setPrimaryKeyColumn(String primaryKeyColumn) {
        this.primaryKeyColumn = primaryKeyColumn;
    }

    public String getProjectIdColumn() {
        return projectIdColumn;
    }

    public void setProjectIdColumn(String projectIdColumn) {
        this.projectIdColumn = projectIdColumn;
    }

    public Integer getMaxAffectedRows() {
        return maxAffectedRows;
    }

    public void setMaxAffectedRows(Integer maxAffectedRows) {
        this.maxAffectedRows = maxAffectedRows;
    }

    public DataPermissionScopeType getRequestScope() {
        return requestScope;
    }

    public void setRequestScope(DataPermissionScopeType requestScope) {
        this.requestScope = requestScope;
    }

    public DataPermissionScopeType getExecuteScope() {
        return executeScope;
    }

    public void setExecuteScope(DataPermissionScopeType executeScope) {
        this.executeScope = executeScope;
    }

    public DataPermissionScopeType getRollbackScope() {
        return rollbackScope;
    }

    public void setRollbackScope(DataPermissionScopeType rollbackScope) {
        this.rollbackScope = rollbackScope;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
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

    public List<DataWorkbenchFieldEntity> getFields() {
        return fields;
    }

    public void setFields(List<DataWorkbenchFieldEntity> fields) {
        this.fields = fields;
    }
}
