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
 * AI Club Pipeline 最近运行的本地快照。
 * 该表只保留回调、幂等和摘要同步需要的最小字段，不承担完整日志归档职责。
 */
@Entity
@Table(name = "ai_club_pipeline_run_snapshot")
public class AiClubPipelineRunSnapshotEntity {

    /** 快照主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属流水线。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private AiClubPipelineEntity pipeline;

    /** Woodpecker run number。 */
    @Column(name = "run_number", nullable = false)
    private Integer runNumber;

    /** 运行状态。 */
    @Column(length = 30)
    private String status;

    /** 运行分支。 */
    @Column(length = 100)
    private String branch;

    /** Woodpecker 事件类型，例如 push / cron。 */
    @Column(length = 50)
    private String event;

    /** 运行说明摘要。 */
    @Column(length = 500)
    private String message;

    /** 提交 SHA。 */
    @Column(name = "commit_sha", length = 100)
    private String commitSha;

    /** 运行链接。 */
    @Column(name = "run_url", length = 500)
    private String runUrl;

    /** 触发来源说明，例如手动触发、Webhook 触发。 */
    @Column(name = "trigger_source", length = 100)
    private String triggerSource;

    /** 远端创建时间。 */
    @Column(name = "created_at_remote")
    private LocalDateTime createdAtRemote;

    /** 远端开始时间。 */
    @Column(name = "started_at_remote")
    private LocalDateTime startedAtRemote;

    /** 远端结束时间。 */
    @Column(name = "finished_at_remote")
    private LocalDateTime finishedAtRemote;

    /** 最近一次从 Woodpecker 同步的时间。 */
    @Column(name = "last_synced_at", nullable = false)
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
        if (this.lastSyncedAt == null) {
            this.lastSyncedAt = now;
        }
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

    public Integer getRunNumber() {
        return runNumber;
    }

    public void setRunNumber(Integer runNumber) {
        this.runNumber = runNumber;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getBranch() {
        return branch;
    }

    public void setBranch(String branch) {
        this.branch = branch;
    }

    public String getEvent() {
        return event;
    }

    public void setEvent(String event) {
        this.event = event;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getCommitSha() {
        return commitSha;
    }

    public void setCommitSha(String commitSha) {
        this.commitSha = commitSha;
    }

    public String getRunUrl() {
        return runUrl;
    }

    public void setRunUrl(String runUrl) {
        this.runUrl = runUrl;
    }

    public String getTriggerSource() {
        return triggerSource;
    }

    public void setTriggerSource(String triggerSource) {
        this.triggerSource = triggerSource;
    }

    public LocalDateTime getCreatedAtRemote() {
        return createdAtRemote;
    }

    public void setCreatedAtRemote(LocalDateTime createdAtRemote) {
        this.createdAtRemote = createdAtRemote;
    }

    public LocalDateTime getStartedAtRemote() {
        return startedAtRemote;
    }

    public void setStartedAtRemote(LocalDateTime startedAtRemote) {
        this.startedAtRemote = startedAtRemote;
    }

    public LocalDateTime getFinishedAtRemote() {
        return finishedAtRemote;
    }

    public void setFinishedAtRemote(LocalDateTime finishedAtRemote) {
        this.finishedAtRemote = finishedAtRemote;
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
