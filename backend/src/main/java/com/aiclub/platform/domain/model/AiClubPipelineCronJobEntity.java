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
 * AI Club Pipeline 的本地 cron 配置。
 * 该表负责保存业务可维护的 cron 定义，并与远端 Woodpecker cron id 做映射。
 */
@Entity
@Table(name = "ai_club_pipeline_cron_job")
public class AiClubPipelineCronJobEntity {

    /** cron 配置主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属的 AI Club Pipeline。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private AiClubPipelineEntity pipeline;

    /** 远端 Woodpecker cron id。 */
    @Column(name = "woodpecker_cron_id")
    private Long woodpeckerCronId;

    /** cron 展示名称。 */
    @Column(nullable = false, length = 120)
    private String name;

    /** cron 触发分支。 */
    @Column(length = 100)
    private String branch;

    /** Woodpecker 使用的带秒 Cron 表达式。 */
    @Column(name = "cron_expression", nullable = false, length = 100)
    private String cronExpression;

    /** 当前 cron 是否启用。 */
    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /** 远端返回的下一次执行时间快照。 */
    @Column(name = "next_run_at")
    private LocalDateTime nextRunAt;

    /** 最近一次同步到远端的时间。 */
    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
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

    public AiClubPipelineEntity getPipeline() {
        return pipeline;
    }

    public void setPipeline(AiClubPipelineEntity pipeline) {
        this.pipeline = pipeline;
    }

    public Long getWoodpeckerCronId() {
        return woodpeckerCronId;
    }

    public void setWoodpeckerCronId(Long woodpeckerCronId) {
        this.woodpeckerCronId = woodpeckerCronId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public String getCronExpression() {
        return cronExpression;
    }

    public void setCronExpression(String cronExpression) {
        this.cronExpression = cronExpression;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public LocalDateTime getNextRunAt() {
        return nextRunAt;
    }

    public void setNextRunAt(LocalDateTime nextRunAt) {
        this.nextRunAt = nextRunAt;
    }

    public LocalDateTime getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(LocalDateTime lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
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
