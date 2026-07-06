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
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * DataChange 执行审计。
 * 业务意图：逐行保存 before/after 快照，回滚时先做冲突检查，避免覆盖后续真实业务修改。
 */
@Entity
@Table(name = "data_change_audit")
public class DataChangeAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 关联的数据变更工单。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id", nullable = false)
    private DataChangeRequestEntity request;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id", nullable = false)
    private DataWorkbenchEntity entity;

    /**
     * 被修改行的主键值。
     */
    @Column(name = "primary_key_value", nullable = false, length = 120)
    private String primaryKeyValue;

    /**
     * 执行前整行快照 JSON。
     */
    @Column(name = "before_snapshot", nullable = false, columnDefinition = "TEXT")
    private String beforeSnapshot;

    /**
     * 执行后整行快照 JSON。
     */
    @Column(name = "after_snapshot", nullable = false, columnDefinition = "TEXT")
    private String afterSnapshot;

    @Column(name = "sql_summary", nullable = false, columnDefinition = "TEXT")
    private String sqlSummary = "";

    @Column(name = "rollback_status", nullable = false, length = 20)
    private String rollbackStatus = "NONE";

    @Column(name = "rollback_conflict_reason", nullable = false, length = 1000)
    private String rollbackConflictReason = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "rolled_back_at")
    private LocalDateTime rolledBackAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public DataChangeRequestEntity getRequest() {
        return request;
    }

    public void setRequest(DataChangeRequestEntity request) {
        this.request = request;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public DataWorkbenchEntity getEntity() {
        return entity;
    }

    public void setEntity(DataWorkbenchEntity entity) {
        this.entity = entity;
    }

    public String getPrimaryKeyValue() {
        return primaryKeyValue;
    }

    public void setPrimaryKeyValue(String primaryKeyValue) {
        this.primaryKeyValue = primaryKeyValue;
    }

    public String getBeforeSnapshot() {
        return beforeSnapshot;
    }

    public void setBeforeSnapshot(String beforeSnapshot) {
        this.beforeSnapshot = beforeSnapshot;
    }

    public String getAfterSnapshot() {
        return afterSnapshot;
    }

    public void setAfterSnapshot(String afterSnapshot) {
        this.afterSnapshot = afterSnapshot;
    }

    public String getSqlSummary() {
        return sqlSummary;
    }

    public void setSqlSummary(String sqlSummary) {
        this.sqlSummary = sqlSummary;
    }

    public String getRollbackStatus() {
        return rollbackStatus;
    }

    public void setRollbackStatus(String rollbackStatus) {
        this.rollbackStatus = rollbackStatus;
    }

    public String getRollbackConflictReason() {
        return rollbackConflictReason;
    }

    public void setRollbackConflictReason(String rollbackConflictReason) {
        this.rollbackConflictReason = rollbackConflictReason;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getRolledBackAt() {
        return rolledBackAt;
    }

    public void setRolledBackAt(LocalDateTime rolledBackAt) {
        this.rolledBackAt = rolledBackAt;
    }
}
