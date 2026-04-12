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
 * 执行运行内的单个步骤。
 * 第一版采用模板化顺序流，因此步骤只需要记录顺序和实际绑定的 Agent。
 */
@Entity
@Table(name = "execution_step")
public class ExecutionStepEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private ExecutionRunEntity run;

    /**
     * 步骤序号。
     */
    @Column(name = "step_no", nullable = false)
    private Integer stepNo;

    /**
     * 步骤编码。
     */
    @Column(name = "step_code", nullable = false, length = 50)
    private String stepCode;

    /**
     * 步骤展示名称。
     */
    @Column(name = "step_name", nullable = false, length = 100)
    private String stepName = "";

    /**
     * 实际执行当前步骤的 Agent。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_id")
    private AgentEntity agent;

    /**
     * 步骤状态。
     */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    /**
     * 步骤输入快照。
     */
    @Column(name = "input_snapshot", nullable = false, columnDefinition = "TEXT")
    private String inputSnapshot = "";

    /**
     * 步骤输出快照。
     */
    @Column(name = "output_snapshot", columnDefinition = "TEXT")
    private String outputSnapshot;

    /**
     * 失败摘要。
     */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /**
     * 步骤开始时间。
     */
    @Column(name = "started_at")
    private LocalDateTime startedAt;

    /**
     * 步骤结束时间。
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

    public ExecutionRunEntity getRun() {
        return run;
    }

    public void setRun(ExecutionRunEntity run) {
        this.run = run;
    }

    public Integer getStepNo() {
        return stepNo;
    }

    public void setStepNo(Integer stepNo) {
        this.stepNo = stepNo;
    }

    public String getStepCode() {
        return stepCode;
    }

    public void setStepCode(String stepCode) {
        this.stepCode = stepCode;
    }

    public String getStepName() {
        return stepName;
    }

    public void setStepName(String stepName) {
        this.stepName = stepName;
    }

    public AgentEntity getAgent() {
        return agent;
    }

    public void setAgent(AgentEntity agent) {
        this.agent = agent;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getInputSnapshot() {
        return inputSnapshot;
    }

    public void setInputSnapshot(String inputSnapshot) {
        this.inputSnapshot = inputSnapshot;
    }

    public String getOutputSnapshot() {
        return outputSnapshot;
    }

    public void setOutputSnapshot(String outputSnapshot) {
        this.outputSnapshot = outputSnapshot;
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
