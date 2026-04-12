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
 * 执行任务的一次运行实例。
 * 同一个执行任务可以因为重试产生多次运行记录。
 */
@Entity
@Table(name = "execution_run")
public class ExecutionRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属执行任务。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "execution_task_id", nullable = false)
    private ExecutionTaskEntity executionTask;

    /**
     * 同一任务下的运行序号。
     */
    @Column(name = "run_no", nullable = false)
    private Integer runNo;

    /**
     * 当前运行状态。
     */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    /**
     * 当前运行进度百分比。
     */
    @Column(name = "progress_percent", nullable = false)
    private Integer progressPercent = 0;

    /**
     * 当前执行到的步骤号。
     */
    @Column(name = "current_step_no")
    private Integer currentStepNo;

    /**
     * 运行启动时的输入快照，JSON 文本格式。
     */
    @Column(name = "input_snapshot", nullable = false, columnDefinition = "TEXT")
    private String inputSnapshot = "{}";

    /**
     * 运行完成后的摘要。
     */
    @Column(name = "output_summary", columnDefinition = "TEXT")
    private String outputSummary;

    /**
     * 运行失败摘要。
     */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /**
     * 实际开始时间。
     */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    /**
     * 实际结束时间。
     */
    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    /**
     * 创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 更新时间。
     */
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

    public ExecutionTaskEntity getExecutionTask() {
        return executionTask;
    }

    public void setExecutionTask(ExecutionTaskEntity executionTask) {
        this.executionTask = executionTask;
    }

    public Integer getRunNo() {
        return runNo;
    }

    public void setRunNo(Integer runNo) {
        this.runNo = runNo;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
    }

    public Integer getCurrentStepNo() {
        return currentStepNo;
    }

    public void setCurrentStepNo(Integer currentStepNo) {
        this.currentStepNo = currentStepNo;
    }

    public String getInputSnapshot() {
        return inputSnapshot;
    }

    public void setInputSnapshot(String inputSnapshot) {
        this.inputSnapshot = inputSnapshot;
    }

    public String getOutputSummary() {
        return outputSummary;
    }

    public void setOutputSummary(String outputSummary) {
        this.outputSummary = outputSummary;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
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
