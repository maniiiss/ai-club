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
 * 建议命中历史。
 * 每次巡检命中同一指纹都记录一条 occurrence，便于在详情抽屉里追踪证据时间线。
 */
@Entity
@Table(name = "self_upgrade_suggestion_occurrence")
public class SelfUpgradeSuggestionOccurrenceEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "suggestion_id", nullable = false)
    private SelfUpgradeSuggestionEntity suggestion;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private SelfUpgradePatrolRunEntity run;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "run_target_id")
    private SelfUpgradePatrolRunTargetEntity runTarget;

    @Column(name = "found_at", nullable = false)
    private LocalDateTime foundAt;

    @Column(name = "evidence_markdown", nullable = false, columnDefinition = "TEXT")
    private String evidenceMarkdown = "";

    @Column(name = "execution_artifact_refs_json", nullable = false, columnDefinition = "TEXT")
    private String executionArtifactRefsJson = "[]";

    @Column(name = "page_path", length = 500)
    private String pagePath;

    @Column(name = "dom_hint_json", nullable = false, columnDefinition = "TEXT")
    private String domHintJson = "{}";

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

    public SelfUpgradePatrolRunEntity getRun() {
        return run;
    }

    public void setRun(SelfUpgradePatrolRunEntity run) {
        this.run = run;
    }

    public SelfUpgradePatrolRunTargetEntity getRunTarget() {
        return runTarget;
    }

    public void setRunTarget(SelfUpgradePatrolRunTargetEntity runTarget) {
        this.runTarget = runTarget;
    }

    public LocalDateTime getFoundAt() {
        return foundAt;
    }

    public void setFoundAt(LocalDateTime foundAt) {
        this.foundAt = foundAt;
    }

    public String getEvidenceMarkdown() {
        return evidenceMarkdown;
    }

    public void setEvidenceMarkdown(String evidenceMarkdown) {
        this.evidenceMarkdown = evidenceMarkdown;
    }

    public String getExecutionArtifactRefsJson() {
        return executionArtifactRefsJson;
    }

    public void setExecutionArtifactRefsJson(String executionArtifactRefsJson) {
        this.executionArtifactRefsJson = executionArtifactRefsJson;
    }

    public String getPagePath() {
        return pagePath;
    }

    public void setPagePath(String pagePath) {
        this.pagePath = pagePath;
    }

    public String getDomHintJson() {
        return domHintJson;
    }

    public void setDomHintJson(String domHintJson) {
        this.domHintJson = domHintJson;
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
