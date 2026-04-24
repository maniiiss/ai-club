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
 * 自升级建议接受后生成的整改工作项。
 * 工作项仍停留在自升级域，不直接映射到 task_info。
 */
@Entity
@Table(name = "self_upgrade_work_item")
public class SelfUpgradeWorkItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "suggestion_id", nullable = false)
    private SelfUpgradeSuggestionEntity suggestion;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description = "";

    @Column(nullable = false, length = 20)
    private String priority = "P2";

    @Column(nullable = false, length = 20)
    private String status = "TODO";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_user_id")
    private UserEntity assigneeUser;

    @Column(name = "repository_bindings_json", nullable = false, columnDefinition = "TEXT")
    private String repositoryBindingsJson = "[]";

    @Column(name = "execution_prompt", nullable = false, columnDefinition = "TEXT")
    private String executionPrompt = "";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "latest_execution_task_id")
    private ExecutionTaskEntity latestExecutionTask;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accepted_by_user_id")
    private UserEntity acceptedByUser;

    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

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

    public SelfUpgradeSuggestionEntity getSuggestion() {
        return suggestion;
    }

    public void setSuggestion(SelfUpgradeSuggestionEntity suggestion) {
        this.suggestion = suggestion;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public UserEntity getAssigneeUser() {
        return assigneeUser;
    }

    public void setAssigneeUser(UserEntity assigneeUser) {
        this.assigneeUser = assigneeUser;
    }

    public String getRepositoryBindingsJson() {
        return repositoryBindingsJson;
    }

    public void setRepositoryBindingsJson(String repositoryBindingsJson) {
        this.repositoryBindingsJson = repositoryBindingsJson;
    }

    public String getExecutionPrompt() {
        return executionPrompt;
    }

    public void setExecutionPrompt(String executionPrompt) {
        this.executionPrompt = executionPrompt;
    }

    public ExecutionTaskEntity getLatestExecutionTask() {
        return latestExecutionTask;
    }

    public void setLatestExecutionTask(ExecutionTaskEntity latestExecutionTask) {
        this.latestExecutionTask = latestExecutionTask;
    }

    public UserEntity getAcceptedByUser() {
        return acceptedByUser;
    }

    public void setAcceptedByUser(UserEntity acceptedByUser) {
        this.acceptedByUser = acceptedByUser;
    }

    public LocalDateTime getAcceptedAt() {
        return acceptedAt;
    }

    public void setAcceptedAt(LocalDateTime acceptedAt) {
        this.acceptedAt = acceptedAt;
    }

    public LocalDateTime getResolvedAt() {
        return resolvedAt;
    }

    public void setResolvedAt(LocalDateTime resolvedAt) {
        this.resolvedAt = resolvedAt;
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
