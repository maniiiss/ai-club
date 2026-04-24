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
 * 自升级巡检计划。
 * 计划只负责编排何时巡检、巡检哪个环境以及默认探索预算。
 */
@Entity
@Table(name = "self_upgrade_patrol_plan")
public class SelfUpgradePatrolPlanEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 1000)
    private String description = "";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "environment_profile_id", nullable = false)
    private SelfUpgradeEnvironmentProfileEntity environmentProfile;

    /**
     * 巡检计划绑定的对话模型配置。
     * v1 明确按计划选择模型，避免把巡检成本和能力绑定到固定 Agent/Codex CLI。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ai_model_config_id", nullable = false)
    private AiModelConfigEntity aiModelConfig;

    @Column(name = "scheduler_cron", length = 100)
    private String schedulerCron;

    @Column(name = "scheduler_enabled", nullable = false)
    private boolean schedulerEnabled;

    @Column(name = "max_exploration_steps", nullable = false)
    private Integer maxExplorationSteps = 25;

    @Column(name = "target_timeout_seconds", nullable = false)
    private Integer targetTimeoutSeconds = 600;

    @Column(name = "run_timeout_seconds", nullable = false)
    private Integer runTimeoutSeconds = 1800;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "last_run_status", length = 30)
    private String lastRunStatus;

    @Column(name = "last_run_message", length = 1000)
    private String lastRunMessage;

    @Column(name = "last_run_at")
    private LocalDateTime lastRunAt;

    @Column(name = "last_scheduled_at")
    private LocalDateTime lastScheduledAt;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public SelfUpgradeEnvironmentProfileEntity getEnvironmentProfile() {
        return environmentProfile;
    }

    public void setEnvironmentProfile(SelfUpgradeEnvironmentProfileEntity environmentProfile) {
        this.environmentProfile = environmentProfile;
    }

    public AiModelConfigEntity getAiModelConfig() {
        return aiModelConfig;
    }

    public void setAiModelConfig(AiModelConfigEntity aiModelConfig) {
        this.aiModelConfig = aiModelConfig;
    }

    public String getSchedulerCron() {
        return schedulerCron;
    }

    public void setSchedulerCron(String schedulerCron) {
        this.schedulerCron = schedulerCron;
    }

    public boolean isSchedulerEnabled() {
        return schedulerEnabled;
    }

    public void setSchedulerEnabled(boolean schedulerEnabled) {
        this.schedulerEnabled = schedulerEnabled;
    }

    public Integer getMaxExplorationSteps() {
        return maxExplorationSteps;
    }

    public void setMaxExplorationSteps(Integer maxExplorationSteps) {
        this.maxExplorationSteps = maxExplorationSteps;
    }

    public Integer getTargetTimeoutSeconds() {
        return targetTimeoutSeconds;
    }

    public void setTargetTimeoutSeconds(Integer targetTimeoutSeconds) {
        this.targetTimeoutSeconds = targetTimeoutSeconds;
    }

    public Integer getRunTimeoutSeconds() {
        return runTimeoutSeconds;
    }

    public void setRunTimeoutSeconds(Integer runTimeoutSeconds) {
        this.runTimeoutSeconds = runTimeoutSeconds;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getLastRunStatus() {
        return lastRunStatus;
    }

    public void setLastRunStatus(String lastRunStatus) {
        this.lastRunStatus = lastRunStatus;
    }

    public String getLastRunMessage() {
        return lastRunMessage;
    }

    public void setLastRunMessage(String lastRunMessage) {
        this.lastRunMessage = lastRunMessage;
    }

    public LocalDateTime getLastRunAt() {
        return lastRunAt;
    }

    public void setLastRunAt(LocalDateTime lastRunAt) {
        this.lastRunAt = lastRunAt;
    }

    public LocalDateTime getLastScheduledAt() {
        return lastScheduledAt;
    }

    public void setLastScheduledAt(LocalDateTime lastScheduledAt) {
        this.lastScheduledAt = lastScheduledAt;
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
