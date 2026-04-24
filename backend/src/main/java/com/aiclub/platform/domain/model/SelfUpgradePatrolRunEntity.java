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
 * 一次完整的自升级巡检运行。
 * 前台看到的是中心内运行记录，后台通过 linkedExecutionTaskId 关联执行中心桥接任务。
 */
@Entity
@Table(name = "self_upgrade_patrol_run")
public class SelfUpgradePatrolRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private SelfUpgradePatrolPlanEntity plan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "environment_profile_id", nullable = false)
    private SelfUpgradeEnvironmentProfileEntity environmentProfile;

    @Column(nullable = false, length = 30)
    private String status = "PENDING";

    /** MANUAL 或 SCHEDULED。 */
    @Column(name = "trigger_mode", nullable = false, length = 20)
    private String triggerMode = "MANUAL";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_execution_task_id")
    private ExecutionTaskEntity linkedExecutionTask;

    @Column(name = "total_target_count", nullable = false)
    private Integer totalTargetCount = 0;

    @Column(name = "success_target_count", nullable = false)
    private Integer successTargetCount = 0;

    @Column(name = "partial_success_target_count", nullable = false)
    private Integer partialSuccessTargetCount = 0;

    @Column(name = "failed_target_count", nullable = false)
    private Integer failedTargetCount = 0;

    @Column(name = "suggestion_count", nullable = false)
    private Integer suggestionCount = 0;

    @Column(name = "opened_suggestion_count", nullable = false)
    private Integer openedSuggestionCount = 0;

    @Column(name = "reopened_suggestion_count", nullable = false)
    private Integer reopenedSuggestionCount = 0;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String summary = "";

    @Column(name = "artifact_refs_json", nullable = false, columnDefinition = "TEXT")
    private String artifactRefsJson = "[]";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private UserEntity createdByUser;

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

    public SelfUpgradePatrolPlanEntity getPlan() {
        return plan;
    }

    public void setPlan(SelfUpgradePatrolPlanEntity plan) {
        this.plan = plan;
    }

    public SelfUpgradeEnvironmentProfileEntity getEnvironmentProfile() {
        return environmentProfile;
    }

    public void setEnvironmentProfile(SelfUpgradeEnvironmentProfileEntity environmentProfile) {
        this.environmentProfile = environmentProfile;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getTriggerMode() {
        return triggerMode;
    }

    public void setTriggerMode(String triggerMode) {
        this.triggerMode = triggerMode;
    }

    public ExecutionTaskEntity getLinkedExecutionTask() {
        return linkedExecutionTask;
    }

    public void setLinkedExecutionTask(ExecutionTaskEntity linkedExecutionTask) {
        this.linkedExecutionTask = linkedExecutionTask;
    }

    public Integer getTotalTargetCount() {
        return totalTargetCount;
    }

    public void setTotalTargetCount(Integer totalTargetCount) {
        this.totalTargetCount = totalTargetCount;
    }

    public Integer getSuccessTargetCount() {
        return successTargetCount;
    }

    public void setSuccessTargetCount(Integer successTargetCount) {
        this.successTargetCount = successTargetCount;
    }

    public Integer getPartialSuccessTargetCount() {
        return partialSuccessTargetCount;
    }

    public void setPartialSuccessTargetCount(Integer partialSuccessTargetCount) {
        this.partialSuccessTargetCount = partialSuccessTargetCount;
    }

    public Integer getFailedTargetCount() {
        return failedTargetCount;
    }

    public void setFailedTargetCount(Integer failedTargetCount) {
        this.failedTargetCount = failedTargetCount;
    }

    public Integer getSuggestionCount() {
        return suggestionCount;
    }

    public void setSuggestionCount(Integer suggestionCount) {
        this.suggestionCount = suggestionCount;
    }

    public Integer getOpenedSuggestionCount() {
        return openedSuggestionCount;
    }

    public void setOpenedSuggestionCount(Integer openedSuggestionCount) {
        this.openedSuggestionCount = openedSuggestionCount;
    }

    public Integer getReopenedSuggestionCount() {
        return reopenedSuggestionCount;
    }

    public void setReopenedSuggestionCount(Integer reopenedSuggestionCount) {
        this.reopenedSuggestionCount = reopenedSuggestionCount;
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

    public UserEntity getCreatedByUser() {
        return createdByUser;
    }

    public void setCreatedByUser(UserEntity createdByUser) {
        this.createdByUser = createdByUser;
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
