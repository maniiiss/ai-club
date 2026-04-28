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

@Entity
@Table(name = "gitlab_product_branch_sync_log")
public class GitlabProductBranchSyncLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属 GitLab 绑定快照。
     * 即使分线被删除，也能依赖 binding 维持数据权限过滤。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "binding_id", nullable = false)
    private ProjectGitlabBindingEntity binding;

    /**
     * 关联的产品分线，可为空，避免删除分线时历史日志被级联清理。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_branch_id")
    private GitlabProductBranchEntity productBranch;

    @Column(name = "product_branch_line_code", length = 80)
    private String productBranchLineCode;

    @Column(name = "product_branch_line_name", length = 120)
    private String productBranchLineName;

    @Column(name = "source_branch_name", nullable = false, length = 120)
    private String sourceBranchName;

    @Column(name = "target_branch_name", nullable = false, length = 120)
    private String targetBranchName;

    @Column(name = "source_commit_sha", length = 80)
    private String sourceCommitSha;

    @Column(name = "target_commit_sha", length = 80)
    private String targetCommitSha;

    @Column(name = "merge_request_iid")
    private Long mergeRequestIid;

    @Column(name = "merge_request_title", length = 255)
    private String mergeRequestTitle;

    @Column(name = "merge_request_web_url", length = 500)
    private String mergeRequestWebUrl;

    @Column(nullable = false, length = 30)
    private String result;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Column(name = "executed_by_user_id")
    private Long executedByUserId;

    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt;

    @PrePersist
    public void onCreate() {
        if (this.executedAt == null) {
            this.executedAt = LocalDateTime.now();
        }
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

    public GitlabProductBranchEntity getProductBranch() {
        return productBranch;
    }

    public void setProductBranch(GitlabProductBranchEntity productBranch) {
        this.productBranch = productBranch;
    }

    public String getProductBranchLineCode() {
        return productBranchLineCode;
    }

    public void setProductBranchLineCode(String productBranchLineCode) {
        this.productBranchLineCode = productBranchLineCode;
    }

    public String getProductBranchLineName() {
        return productBranchLineName;
    }

    public void setProductBranchLineName(String productBranchLineName) {
        this.productBranchLineName = productBranchLineName;
    }

    public String getSourceBranchName() {
        return sourceBranchName;
    }

    public void setSourceBranchName(String sourceBranchName) {
        this.sourceBranchName = sourceBranchName;
    }

    public String getTargetBranchName() {
        return targetBranchName;
    }

    public void setTargetBranchName(String targetBranchName) {
        this.targetBranchName = targetBranchName;
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

    public Long getMergeRequestIid() {
        return mergeRequestIid;
    }

    public void setMergeRequestIid(Long mergeRequestIid) {
        this.mergeRequestIid = mergeRequestIid;
    }

    public String getMergeRequestTitle() {
        return mergeRequestTitle;
    }

    public void setMergeRequestTitle(String mergeRequestTitle) {
        this.mergeRequestTitle = mergeRequestTitle;
    }

    public String getMergeRequestWebUrl() {
        return mergeRequestWebUrl;
    }

    public void setMergeRequestWebUrl(String mergeRequestWebUrl) {
        this.mergeRequestWebUrl = mergeRequestWebUrl;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public Long getExecutedByUserId() {
        return executedByUserId;
    }

    public void setExecutedByUserId(Long executedByUserId) {
        this.executedByUserId = executedByUserId;
    }

    public LocalDateTime getExecutedAt() {
        return executedAt;
    }

    public void setExecutedAt(LocalDateTime executedAt) {
        this.executedAt = executedAt;
    }
}
