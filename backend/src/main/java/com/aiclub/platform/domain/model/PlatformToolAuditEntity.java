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
 * 平台工具执行审计。
 */
@Entity
@Table(name = "platform_tool_audit")
public class PlatformToolAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 工具编码。
     */
    @Column(name = "tool_code", nullable = false, length = 100)
    private String toolCode;

    /**
     * 工具展示名称快照。
     */
    @Column(name = "tool_name", nullable = false, length = 120)
    private String toolName = "";

    /**
     * 触发来源，例如 HERMES、PAGE。
     */
    @Column(name = "trigger_source", nullable = false, length = 40)
    private String triggerSource = "HERMES";

    /**
     * 调用用户。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private UserEntity user;

    @Column(name = "scope_key", length = 200)
    private String scopeKey;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "biz_type", length = 80)
    private String bizType;

    @Column(name = "biz_id")
    private Long bizId;

    @Column(name = "request_summary", nullable = false, length = 1000)
    private String requestSummary = "";

    @Column(name = "result_summary", nullable = false, length = 1000)
    private String resultSummary = "";

    @Column(name = "execution_status", nullable = false, length = 20)
    private String executionStatus;

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public void markRunning() {
        this.executionStatus = "RUNNING";
        this.finishedAt = null;
    }

    public void finish(String status, String resultSummary, String errorMessage) {
        this.executionStatus = status;
        this.resultSummary = resultSummary == null ? "" : resultSummary;
        this.errorMessage = errorMessage;
        this.finishedAt = LocalDateTime.now();
    }

    public void setToolCode(String toolCode) {
        this.toolCode = toolCode;
    }

    public void setToolName(String toolName) {
        this.toolName = toolName;
    }

    public void setTriggerSource(String triggerSource) {
        this.triggerSource = triggerSource;
    }

    public void setUser(UserEntity user) {
        this.user = user;
    }

    public void setScopeKey(String scopeKey) {
        this.scopeKey = scopeKey;
    }

    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    public void setBizType(String bizType) {
        this.bizType = bizType;
    }

    public void setBizId(Long bizId) {
        this.bizId = bizId;
    }

    public void setRequestSummary(String requestSummary) {
        this.requestSummary = requestSummary;
    }
}
