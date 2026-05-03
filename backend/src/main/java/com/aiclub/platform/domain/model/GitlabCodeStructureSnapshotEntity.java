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
 * GitLab 仓库代码结构快照。
 * 一条记录对应一个绑定仓库在某个分支上的最近结构化结果，供代码仓库管理页直接读取。
 */
@Entity
@Table(name = "gitlab_code_structure_snapshot")
public class GitlabCodeStructureSnapshotEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 归属的 GitLab 仓库绑定。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "binding_id", nullable = false)
    private ProjectGitlabBindingEntity binding;

    /**
     * 当前快照对应的分支名。
     */
    @Column(name = "branch_name", nullable = false, length = 120)
    private String branchName;

    /**
     * 快照状态。
     * 固定枚举：NOT_BUILT、BUILDING、READY、DEGRADED、FAILED。
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /**
     * 结构化时固定到的提交 SHA。
     */
    @Column(name = "commit_sha", length = 120)
    private String commitSha;

    /**
     * 快照成功生成的时间；失败时保留旧值，让页面还能读取最近一次可用结果。
     */
    @Column(name = "generated_at")
    private LocalDateTime generatedAt;

    /**
     * 标记这份结果是否包含 GitNexus 降级信息。
     */
    @Column(name = "degraded", nullable = false)
    private boolean degraded;

    /**
     * 仓库概览摘要 Markdown，主要用于页面摘要和问题提示。
     */
    @Column(name = "summary_markdown", columnDefinition = "TEXT")
    private String summaryMarkdown;

    /**
     * 概览卡片、候选流程、候选符号和 harness 提示的 JSON 快照。
     */
    @Column(name = "overview_json", columnDefinition = "TEXT")
    private String overviewJson;

    /**
     * 图谱节点和边的 JSON 快照。
     */
    @Column(name = "graph_json", columnDefinition = "TEXT")
    private String graphJson;

    /**
     * 最近一次刷新失败或降级的错误摘要。
     */
    @Column(name = "last_error_message", columnDefinition = "TEXT")
    private String lastErrorMessage;

    /**
     * 最近一次刷新开始时间。
     */
    @Column(name = "refresh_started_at")
    private LocalDateTime refreshStartedAt;

    /**
     * 最近一次刷新结束时间。
     */
    @Column(name = "refresh_finished_at")
    private LocalDateTime refreshFinishedAt;

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

    public ProjectGitlabBindingEntity getBinding() {
        return binding;
    }

    public void setBinding(ProjectGitlabBindingEntity binding) {
        this.binding = binding;
    }

    public String getBranchName() {
        return branchName;
    }

    public void setBranchName(String branchName) {
        this.branchName = branchName;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getCommitSha() {
        return commitSha;
    }

    public void setCommitSha(String commitSha) {
        this.commitSha = commitSha;
    }

    public LocalDateTime getGeneratedAt() {
        return generatedAt;
    }

    public void setGeneratedAt(LocalDateTime generatedAt) {
        this.generatedAt = generatedAt;
    }

    public boolean isDegraded() {
        return degraded;
    }

    public void setDegraded(boolean degraded) {
        this.degraded = degraded;
    }

    public String getSummaryMarkdown() {
        return summaryMarkdown;
    }

    public void setSummaryMarkdown(String summaryMarkdown) {
        this.summaryMarkdown = summaryMarkdown;
    }

    public String getOverviewJson() {
        return overviewJson;
    }

    public void setOverviewJson(String overviewJson) {
        this.overviewJson = overviewJson;
    }

    public String getGraphJson() {
        return graphJson;
    }

    public void setGraphJson(String graphJson) {
        this.graphJson = graphJson;
    }

    public String getLastErrorMessage() {
        return lastErrorMessage;
    }

    public void setLastErrorMessage(String lastErrorMessage) {
        this.lastErrorMessage = lastErrorMessage;
    }

    public LocalDateTime getRefreshStartedAt() {
        return refreshStartedAt;
    }

    public void setRefreshStartedAt(LocalDateTime refreshStartedAt) {
        this.refreshStartedAt = refreshStartedAt;
    }

    public LocalDateTime getRefreshFinishedAt() {
        return refreshFinishedAt;
    }

    public void setRefreshFinishedAt(LocalDateTime refreshFinishedAt) {
        this.refreshFinishedAt = refreshFinishedAt;
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
