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
 * DataChange 变更工单。
 * 业务意图：把自然语言诉求、DSL、预览、审批、执行和回滚状态收口到同一条可审计工单。
 */
@Entity
@Table(name = "data_change_request")
public class DataChangeRequestEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 项目范围，首期禁止项目外和跨项目变更。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 变更目标业务实体。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entity_id", nullable = false)
    private DataWorkbenchEntity entity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_user_id")
    private UserEntity requesterUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approver_user_id")
    private UserEntity approverUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "executor_user_id")
    private UserEntity executorUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rollback_user_id")
    private UserEntity rollbackUser;

    /**
     * 用户提交的自然语言原文。
     */
    @Column(name = "original_text", nullable = false, columnDefinition = "TEXT")
    private String originalText;

    /**
     * 后端解析出的 DSL JSON。
     */
    @Column(name = "dsl_json", nullable = false, columnDefinition = "TEXT")
    private String dslJson = "{}";

    /**
     * 参数化 SQL 摘要，只用于审计和预览，不接受外部 SQL。
     */
    @Column(name = "preview_sql_summary", nullable = false, columnDefinition = "TEXT")
    private String previewSqlSummary = "";

    @Column(name = "risk_level", nullable = false, length = 20)
    private String riskLevel = "LOW";

    @Column(name = "approval_status", nullable = false, length = 20)
    private String approvalStatus = "NOT_REQUIRED";

    @Column(name = "execution_status", nullable = false, length = 20)
    private String executionStatus = "DRAFT";

    @Column(name = "rollback_status", nullable = false, length = 20)
    private String rollbackStatus = "NONE";

    @Column(name = "affected_rows", nullable = false)
    private Integer affectedRows = 0;

    @Column(name = "risk_reasons", nullable = false, columnDefinition = "TEXT")
    private String riskReasons = "";

    @Column(name = "reject_reason", nullable = false, length = 1000)
    private String rejectReason = "";

    @Column(name = "rollback_conflict_reason", nullable = false, length = 1000)
    private String rollbackConflictReason = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "executed_at")
    private LocalDateTime executedAt;

    @Column(name = "rolled_back_at")
    private LocalDateTime rolledBackAt;

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

    public UserEntity getRequesterUser() {
        return requesterUser;
    }

    public void setRequesterUser(UserEntity requesterUser) {
        this.requesterUser = requesterUser;
    }

    public UserEntity getApproverUser() {
        return approverUser;
    }

    public void setApproverUser(UserEntity approverUser) {
        this.approverUser = approverUser;
    }

    public UserEntity getExecutorUser() {
        return executorUser;
    }

    public void setExecutorUser(UserEntity executorUser) {
        this.executorUser = executorUser;
    }

    public UserEntity getRollbackUser() {
        return rollbackUser;
    }

    public void setRollbackUser(UserEntity rollbackUser) {
        this.rollbackUser = rollbackUser;
    }

    public String getOriginalText() {
        return originalText;
    }

    public void setOriginalText(String originalText) {
        this.originalText = originalText;
    }

    public String getDslJson() {
        return dslJson;
    }

    public void setDslJson(String dslJson) {
        this.dslJson = dslJson;
    }

    public String getPreviewSqlSummary() {
        return previewSqlSummary;
    }

    public void setPreviewSqlSummary(String previewSqlSummary) {
        this.previewSqlSummary = previewSqlSummary;
    }

    public String getRiskLevel() {
        return riskLevel;
    }

    public void setRiskLevel(String riskLevel) {
        this.riskLevel = riskLevel;
    }

    public String getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(String approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public String getExecutionStatus() {
        return executionStatus;
    }

    public void setExecutionStatus(String executionStatus) {
        this.executionStatus = executionStatus;
    }

    public String getRollbackStatus() {
        return rollbackStatus;
    }

    public void setRollbackStatus(String rollbackStatus) {
        this.rollbackStatus = rollbackStatus;
    }

    public Integer getAffectedRows() {
        return affectedRows;
    }

    public void setAffectedRows(Integer affectedRows) {
        this.affectedRows = affectedRows;
    }

    public String getRiskReasons() {
        return riskReasons;
    }

    public void setRiskReasons(String riskReasons) {
        this.riskReasons = riskReasons;
    }

    public String getRejectReason() {
        return rejectReason;
    }

    public void setRejectReason(String rejectReason) {
        this.rejectReason = rejectReason;
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

    public LocalDateTime getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(LocalDateTime approvedAt) {
        this.approvedAt = approvedAt;
    }

    public LocalDateTime getExecutedAt() {
        return executedAt;
    }

    public void setExecutedAt(LocalDateTime executedAt) {
        this.executedAt = executedAt;
    }

    public LocalDateTime getRolledBackAt() {
        return rolledBackAt;
    }

    public void setRolledBackAt(LocalDateTime rolledBackAt) {
        this.rolledBackAt = rolledBackAt;
    }
}
