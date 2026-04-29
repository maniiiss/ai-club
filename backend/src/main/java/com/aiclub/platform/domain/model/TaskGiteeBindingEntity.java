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
 * 本地工作项与 Gitee issue 的映射。
 * 绑定记录保留“工作项当前归属的 Gitee 迭代范围”，即使本地任务临时被移出迭代，也保留远端追踪能力。
 */
@Entity
@Table(name = "task_gitee_binding")
public class TaskGiteeBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    private TaskEntity task;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "iteration_id", nullable = false)
    private IterationEntity iteration;

    @Column(name = "enterprise_id", nullable = false)
    private Long enterpriseId;

    @Column(name = "gitee_program_id", nullable = false)
    private Long giteeProgramId;

    @Column(name = "gitee_milestone_id", nullable = false)
    private Long giteeMilestoneId;

    @Column(name = "gitee_issue_id", nullable = false)
    private Long giteeIssueId;

    @Column(name = "gitee_issue_url", length = 500)
    private String giteeIssueUrl;

    @Column(name = "last_sync_status", length = 30)
    private String lastSyncStatus;

    @Column(name = "last_sync_at")
    private LocalDateTime lastSyncAt;

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

    public TaskEntity getTask() {
        return task;
    }

    public void setTask(TaskEntity task) {
        this.task = task;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public IterationEntity getIteration() {
        return iteration;
    }

    public void setIteration(IterationEntity iteration) {
        this.iteration = iteration;
    }

    public Long getEnterpriseId() {
        return enterpriseId;
    }

    public void setEnterpriseId(Long enterpriseId) {
        this.enterpriseId = enterpriseId;
    }

    public Long getGiteeProgramId() {
        return giteeProgramId;
    }

    public void setGiteeProgramId(Long giteeProgramId) {
        this.giteeProgramId = giteeProgramId;
    }

    public Long getGiteeMilestoneId() {
        return giteeMilestoneId;
    }

    public void setGiteeMilestoneId(Long giteeMilestoneId) {
        this.giteeMilestoneId = giteeMilestoneId;
    }

    public Long getGiteeIssueId() {
        return giteeIssueId;
    }

    public void setGiteeIssueId(Long giteeIssueId) {
        this.giteeIssueId = giteeIssueId;
    }

    public String getGiteeIssueUrl() {
        return giteeIssueUrl;
    }

    public void setGiteeIssueUrl(String giteeIssueUrl) {
        this.giteeIssueUrl = giteeIssueUrl;
    }

    public String getLastSyncStatus() {
        return lastSyncStatus;
    }

    public void setLastSyncStatus(String lastSyncStatus) {
        this.lastSyncStatus = lastSyncStatus;
    }

    public LocalDateTime getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(LocalDateTime lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
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
