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
 * 单次巡检中每个目标入口的执行结果。
 */
@Entity
@Table(name = "self_upgrade_patrol_run_target")
public class SelfUpgradePatrolRunTargetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private SelfUpgradePatrolRunEntity run;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_target_id")
    private SelfUpgradePatrolTargetEntity planTarget;

    @Column(name = "target_name", nullable = false, length = 120)
    private String targetName;

    @Column(name = "seed_url", nullable = false, length = 500)
    private String seedUrl = "";

    @Column(nullable = false, length = 30)
    private String status = "PENDING";

    @Column(name = "page_path", length = 500)
    private String pagePath;

    @Column(name = "step_count", nullable = false)
    private Integer stepCount = 0;

    @Column(name = "finding_count", nullable = false)
    private Integer findingCount = 0;

    @Column(name = "skipped_guardrail_count", nullable = false)
    private Integer skippedGuardrailCount = 0;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String summary = "";

    @Column(name = "artifact_refs_json", nullable = false, columnDefinition = "TEXT")
    private String artifactRefsJson = "[]";

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

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

    public SelfUpgradePatrolRunEntity getRun() {
        return run;
    }

    public void setRun(SelfUpgradePatrolRunEntity run) {
        this.run = run;
    }

    public SelfUpgradePatrolTargetEntity getPlanTarget() {
        return planTarget;
    }

    public void setPlanTarget(SelfUpgradePatrolTargetEntity planTarget) {
        this.planTarget = planTarget;
    }

    public String getTargetName() {
        return targetName;
    }

    public void setTargetName(String targetName) {
        this.targetName = targetName;
    }

    public String getSeedUrl() {
        return seedUrl;
    }

    public void setSeedUrl(String seedUrl) {
        this.seedUrl = seedUrl;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPagePath() {
        return pagePath;
    }

    public void setPagePath(String pagePath) {
        this.pagePath = pagePath;
    }

    public Integer getStepCount() {
        return stepCount;
    }

    public void setStepCount(Integer stepCount) {
        this.stepCount = stepCount;
    }

    public Integer getFindingCount() {
        return findingCount;
    }

    public void setFindingCount(Integer findingCount) {
        this.findingCount = findingCount;
    }

    public Integer getSkippedGuardrailCount() {
        return skippedGuardrailCount;
    }

    public void setSkippedGuardrailCount(Integer skippedGuardrailCount) {
        this.skippedGuardrailCount = skippedGuardrailCount;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getArtifactRefsJson() {
        return artifactRefsJson;
    }

    public void setArtifactRefsJson(String artifactRefsJson) {
        this.artifactRefsJson = artifactRefsJson;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getFinishedAt() {
        return finishedAt;
    }

    public void setFinishedAt(LocalDateTime finishedAt) {
        this.finishedAt = finishedAt;
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
