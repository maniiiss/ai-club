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
 * 业主仓库推送历史日志。
 * 每次手动推送业主代码仓库后落库一条记录，包含源/目标分支、推送方式、执行状态及 MR 信息。
 */
@Entity
@Table(name = "owner_repo_push_log")
public class OwnerRepoPushLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 对应的业主仓库绑定。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "binding_id", nullable = false)
    private ProjectOwnerRepoBindingEntity binding;

    /**
     * 源 GitLab 绑定（平台侧仓库），推送代码的来源。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_binding_id")
    private ProjectGitlabBindingEntity sourceBinding;

    @Column(name = "source_branch", nullable = false, length = 100)
    private String sourceBranch;

    @Column(name = "target_branch", nullable = false, length = 100)
    private String targetBranch;

    /**
     * 本次推送方式：DIRECT / NEW_BRANCH / MERGE_REQUEST。
     */
    @Column(name = "push_mode", nullable = false, length = 20)
    private String pushMode;

    @Column(name = "source_commit_sha", length = 64)
    private String sourceCommitSha;

    @Column(name = "target_commit_sha", length = 64)
    private String targetCommitSha;

    /**
     * MERGE_REQUEST 方式下创建的 MR iid，其他方式为空。
     */
    @Column(name = "merge_request_iid", length = 64)
    private String mergeRequestIid;

    @Column(name = "merge_request_web_url", length = 500)
    private String mergeRequestWebUrl;

    /**
     * 执行状态：SUCCESS / PARTIAL / FAILED。
     */
    @Column(name = "execution_status", nullable = false, length = 20)
    private String executionStatus;

    @Column(name = "summary_message", length = 1000)
    private String summaryMessage;

    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ProjectOwnerRepoBindingEntity getBinding() {
        return binding;
    }

    public void setBinding(ProjectOwnerRepoBindingEntity binding) {
        this.binding = binding;
    }

    public ProjectGitlabBindingEntity getSourceBinding() {
        return sourceBinding;
    }

    public void setSourceBinding(ProjectGitlabBindingEntity sourceBinding) {
        this.sourceBinding = sourceBinding;
    }

    public String getSourceBranch() {
        return sourceBranch;
    }

    public void setSourceBranch(String sourceBranch) {
        this.sourceBranch = sourceBranch;
    }

    public String getTargetBranch() {
        return targetBranch;
    }

    public void setTargetBranch(String targetBranch) {
        this.targetBranch = targetBranch;
    }

    public String getPushMode() {
        return pushMode;
    }

    public void setPushMode(String pushMode) {
        this.pushMode = pushMode;
    }

    public String getSourceCommitSha() {
        return sourceCommitSha;
    }

    public void setSourceCommitSha(String sourceCommitSha) {
        this.sourceCommitSha = sourceCommitSha;
    }

    public String getTargetCommitSha() {
        return targetCommitSha;
    }

    public void setTargetCommitSha(String targetCommitSha) {
        this.targetCommitSha = targetCommitSha;
    }

    public String getMergeRequestIid() {
        return mergeRequestIid;
    }

    public void setMergeRequestIid(String mergeRequestIid) {
        this.mergeRequestIid = mergeRequestIid;
    }

    public String getMergeRequestWebUrl() {
        return mergeRequestWebUrl;
    }

    public void setMergeRequestWebUrl(String mergeRequestWebUrl) {
        this.mergeRequestWebUrl = mergeRequestWebUrl;
    }

    public String getExecutionStatus() {
        return executionStatus;
    }

    public void setExecutionStatus(String executionStatus) {
        this.executionStatus = executionStatus;
    }

    public String getSummaryMessage() {
        return summaryMessage;
    }

    public void setSummaryMessage(String summaryMessage) {
        this.summaryMessage = summaryMessage;
    }

    public LocalDateTime getExecutedAt() {
        return executedAt;
    }

    public void setExecutedAt(LocalDateTime executedAt) {
        this.executedAt = executedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
