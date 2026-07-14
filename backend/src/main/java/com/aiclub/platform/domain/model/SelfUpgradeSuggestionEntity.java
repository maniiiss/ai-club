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
 * 自升级中心独立建议卡片。
 * 建议完全独立于 Assistant，会持续聚合同一指纹下的多次命中与重开历史。
 */
@Entity
@Table(name = "self_upgrade_suggestion")
public class SelfUpgradeSuggestionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 128)
    private String fingerprint;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, length = 60)
    private String category;

    @Column(nullable = false, length = 20)
    private String severity;

    @Column(nullable = false, length = 20)
    private String status = "OPEN";

    @Column(name = "hit_count", nullable = false)
    private Integer hitCount = 1;

    @Column(name = "reopen_count", nullable = false)
    private Integer reopenCount = 0;

    @Column(name = "first_found_at", nullable = false)
    private LocalDateTime firstFoundAt;

    @Column(name = "last_found_at", nullable = false)
    private LocalDateTime lastFoundAt;

    @Column(name = "latest_summary", nullable = false, columnDefinition = "TEXT")
    private String latestSummary = "";

    @Column(name = "latest_evidence_markdown", nullable = false, columnDefinition = "TEXT")
    private String latestEvidenceMarkdown = "";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "latest_run_id")
    private SelfUpgradePatrolRunEntity latestRun;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "latest_target_id")
    private SelfUpgradePatrolRunTargetEntity latestTarget;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_work_item_id")
    private SelfUpgradeWorkItemEntity linkedWorkItem;

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

    public String getFingerprint() {
        return fingerprint;
    }

    public void setFingerprint(String fingerprint) {
        this.fingerprint = fingerprint;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getSeverity() {
        return severity;
    }

    public void setSeverity(String severity) {
        this.severity = severity;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getHitCount() {
        return hitCount;
    }

    public void setHitCount(Integer hitCount) {
        this.hitCount = hitCount;
    }

    public Integer getReopenCount() {
        return reopenCount;
    }

    public void setReopenCount(Integer reopenCount) {
        this.reopenCount = reopenCount;
    }

    public LocalDateTime getFirstFoundAt() {
        return firstFoundAt;
    }

    public void setFirstFoundAt(LocalDateTime firstFoundAt) {
        this.firstFoundAt = firstFoundAt;
    }

    public LocalDateTime getLastFoundAt() {
        return lastFoundAt;
    }

    public void setLastFoundAt(LocalDateTime lastFoundAt) {
        this.lastFoundAt = lastFoundAt;
    }

    public String getLatestSummary() {
        return latestSummary;
    }

    public void setLatestSummary(String latestSummary) {
        this.latestSummary = latestSummary;
    }

    public String getLatestEvidenceMarkdown() {
        return latestEvidenceMarkdown;
    }

    public void setLatestEvidenceMarkdown(String latestEvidenceMarkdown) {
        this.latestEvidenceMarkdown = latestEvidenceMarkdown;
    }

    public SelfUpgradePatrolRunEntity getLatestRun() {
        return latestRun;
    }

    public void setLatestRun(SelfUpgradePatrolRunEntity latestRun) {
        this.latestRun = latestRun;
    }

    public SelfUpgradePatrolRunTargetEntity getLatestTarget() {
        return latestTarget;
    }

    public void setLatestTarget(SelfUpgradePatrolRunTargetEntity latestTarget) {
        this.latestTarget = latestTarget;
    }

    public SelfUpgradeWorkItemEntity getLinkedWorkItem() {
        return linkedWorkItem;
    }

    public void setLinkedWorkItem(SelfUpgradeWorkItemEntity linkedWorkItem) {
        this.linkedWorkItem = linkedWorkItem;
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
