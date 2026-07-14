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
 * Assistant 会话轻量审计日志，用于排障与运营分析，不承担记忆召回职责。
 */
@Entity
@Table(name = "hermes_chat_audit")
public class AssistantChatAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 发起本次对话的登录用户。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private UserEntity user;

    /**
     * 当前问答所属的范围键，固定按用户或用户+项目隔离。
     */
    @Column(name = "scope_key", nullable = false, length = 200)
    private String scopeKey;

    /**
     * 前端发起问答时的当前路由名称。
     */
    @Column(name = "route_name", nullable = false, length = 80)
    private String routeName;

    /**
     * 当前问答关联的项目 ID。
     */
    @Column(name = "project_id")
    private Long projectId;

    /**
     * 当前问答关联的任务 ID。
     */
    @Column(name = "task_id")
    private Long taskId;

    /**
     * 当前问答关联的迭代 ID。
     */
    @Column(name = "iteration_id")
    private Long iterationId;

    /**
     * 当前问答关联的测试计划 ID。
     */
    @Column(name = "plan_id")
    private Long planId;

    /**
     * 发起问答时的主角色名称，仅用于运营侧理解用户画像。
     */
    @Column(name = "role_name", length = 100)
    private String roleName;

    /**
     * 用户问题的摘要化记录，避免直接保存完整 transcript。
     */
    @Column(name = "question_summary", nullable = false, length = 500)
    private String questionSummary = "";

    /**
     * Assistant 最终回答的摘要化记录。
     */
    @Column(name = "response_summary", length = 1000)
    private String responseSummary;

    /**
     * Assistant 网关返回的响应标识，便于关联远端日志。
     */
    @Column(name = "hermes_response_id", length = 120)
    private String assistantResponseId;

    /**
     * 当前流式对话状态，例如 RUNNING、SUCCESS、FAILED。
     */
    @Column(nullable = false, length = 20)
    private String status = "RUNNING";

    /**
     * 失败时的错误摘要。
     */
    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    /**
     * 审计日志创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 流式会话结束时间。
     */
    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    public AssistantChatAuditEntity() {
    }

    /**
     * 首次落库时自动记录创建时间，避免业务层遗漏。
     */
    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public UserEntity getUser() {
        return user;
    }

    public void setUser(UserEntity user) {
        this.user = user;
    }

    public String getScopeKey() {
        return scopeKey;
    }

    public void setScopeKey(String scopeKey) {
        this.scopeKey = scopeKey;
    }

    public String getRouteName() {
        return routeName;
    }

    public void setRouteName(String routeName) {
        this.routeName = routeName;
    }

    public Long getProjectId() {
        return projectId;
    }

    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    public Long getTaskId() {
        return taskId;
    }

    public void setTaskId(Long taskId) {
        this.taskId = taskId;
    }

    public Long getIterationId() {
        return iterationId;
    }

    public void setIterationId(Long iterationId) {
        this.iterationId = iterationId;
    }

    public Long getPlanId() {
        return planId;
    }

    public void setPlanId(Long planId) {
        this.planId = planId;
    }

    public String getRoleName() {
        return roleName;
    }

    public void setRoleName(String roleName) {
        this.roleName = roleName;
    }

    public String getQuestionSummary() {
        return questionSummary;
    }

    public void setQuestionSummary(String questionSummary) {
        this.questionSummary = questionSummary;
    }

    public String getResponseSummary() {
        return responseSummary;
    }

    public void setResponseSummary(String responseSummary) {
        this.responseSummary = responseSummary;
    }

    public String getAssistantResponseId() {
        return assistantResponseId;
    }

    public void setAssistantResponseId(String assistantResponseId) {
        this.assistantResponseId = assistantResponseId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(LocalDateTime finishedAt) {
        this.finishedAt = finishedAt;
    }
}
