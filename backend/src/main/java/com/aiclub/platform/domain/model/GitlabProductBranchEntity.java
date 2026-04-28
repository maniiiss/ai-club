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

@Entity
@Table(name = "gitlab_product_branch")
public class GitlabProductBranchEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属 GitLab 仓库绑定。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "binding_id", nullable = false)
    private ProjectGitlabBindingEntity binding;

    /**
     * 产品线编码，用于批量同步和平台内部识别。
     */
    @Column(name = "line_code", nullable = false, length = 80)
    private String lineCode;

    /**
     * 产品线名称，供页面直接展示。
     */
    @Column(name = "line_name", nullable = false, length = 120)
    private String lineName;

    /**
     * 对应 GitLab 中的产品分线分支名。
     */
    @Column(name = "branch_name", nullable = false, length = 120)
    private String branchName;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "last_sync_status", length = 30)
    private String lastSyncStatus;

    @Column(name = "last_sync_message", length = 500)
    private String lastSyncMessage;

    @Column(name = "last_sync_at")
    private LocalDateTime lastSyncAt;

    @Column(name = "last_sync_merge_request_iid")
    private Long lastSyncMergeRequestIid;

    @Column(name = "last_sync_merge_request_web_url", length = 500)
    private String lastSyncMergeRequestWebUrl;

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

    public String getLineCode() {
        return lineCode;
    }

    public void setLineCode(String lineCode) {
        this.lineCode = lineCode;
    }

    public String getLineName() {
        return lineName;
    }

    public void setLineName(String lineName) {
        this.lineName = lineName;
    }

    public String getBranchName() {
        return branchName;
    }

    public void setBranchName(String branchName) {
        this.branchName = branchName;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getLastSyncStatus() {
        return lastSyncStatus;
    }

    public void setLastSyncStatus(String lastSyncStatus) {
        this.lastSyncStatus = lastSyncStatus;
    }

    public String getLastSyncMessage() {
        return lastSyncMessage;
    }

    public void setLastSyncMessage(String lastSyncMessage) {
        this.lastSyncMessage = lastSyncMessage;
    }

    public LocalDateTime getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(LocalDateTime lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
    }

    public Long getLastSyncMergeRequestIid() {
        return lastSyncMergeRequestIid;
    }

    public void setLastSyncMergeRequestIid(Long lastSyncMergeRequestIid) {
        this.lastSyncMergeRequestIid = lastSyncMergeRequestIid;
    }

    public String getLastSyncMergeRequestWebUrl() {
        return lastSyncMergeRequestWebUrl;
    }

    public void setLastSyncMergeRequestWebUrl(String lastSyncMergeRequestWebUrl) {
        this.lastSyncMergeRequestWebUrl = lastSyncMergeRequestWebUrl;
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
