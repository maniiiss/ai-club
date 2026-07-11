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
 * 执行中心任务实体。
 * 该实体用于承接“页面入口 / Hermes / 兼容旧接口”统一发起的智能体执行任务定义。
 */
@Entity
@Table(name = "execution_task")
public class ExecutionTaskEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 执行任务来源类型，例如 WORK_ITEM、LEGACY_TASK_AGENT_RUN。
     */
    @Column(name = "source_type", nullable = false, length = 40)
    private String sourceType;

    /**
     * 来源业务主键，用于回溯工作项或兼容旧任务入口。
     */
    @Column(name = "source_id")
    private Long sourceId;

    /**
     * 触发来源，例如 PAGE、HERMES。
     */
    @Column(name = "trigger_source", nullable = false, length = 40)
    private String triggerSource = "PAGE";

    /**
     * 场景编码，由执行工作流服务统一解释。
     */
    @Column(name = "scenario_code", nullable = false, length = 50)
    private String scenarioCode;

    /**
     * 执行中心展示标题。
     */
    @Column(nullable = false, length = 200)
    private String title = "";

    /**
     * 所属项目。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 关联工作项，为空时表示来源不是具体工作项。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "work_item_id")
    private TaskEntity workItem;

    /**
     * 发起执行任务的用户。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private UserEntity createdByUser;

    /**
     * 当前执行状态。
     */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    /**
     * 是否已请求取消。
     * 第一版不强制中断当前步骤，仅在步骤边界生效。
     */
    @Column(name = "cancel_requested", nullable = false)
    private boolean cancelRequested;

    /**
     * 当前运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_run_id")
    private ExecutionRunEntity currentRun;

    /**
     * 列表页最近摘要。
     */
    @Column(name = "latest_summary", nullable = false, length = 1000)
    private String latestSummary = "";

    /**
     * 创建执行任务时提交的上下文输入载荷，JSON 文本格式。
     */
    @Column(name = "input_payload", nullable = false, columnDefinition = "TEXT")
    private String inputPayload = "{}";

    /**
     * 解析并固化后的步骤 Agent 绑定信息，JSON 文本格式。
     */
    @Column(name = "agent_binding_payload", nullable = false, columnDefinition = "TEXT")
    private String agentBindingPayload = "[]";

    /** 创建任务时采用的已发布编排版本；旧任务和非受管场景为空。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "orchestration_version_id")
    private ExecutionOrchestrationVersionEntity orchestrationVersion;

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

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public Long getSourceId() {
        return sourceId;
    }

    public void setSourceId(Long sourceId) {
        this.sourceId = sourceId;
    }

    public String getTriggerSource() {
        return triggerSource;
    }

    public void setTriggerSource(String triggerSource) {
        this.triggerSource = triggerSource;
    }

    public String getScenarioCode() {
        return scenarioCode;
    }

    public void setScenarioCode(String scenarioCode) {
        this.scenarioCode = scenarioCode;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public TaskEntity getWorkItem() {
        return workItem;
    }

    public void setWorkItem(TaskEntity workItem) {
        this.workItem = workItem;
    }

    public UserEntity getCreatedByUser() {
        return createdByUser;
    }

    public void setCreatedByUser(UserEntity createdByUser) {
        this.createdByUser = createdByUser;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public boolean isCancelRequested() {
        return cancelRequested;
    }

    public void setCancelRequested(boolean cancelRequested) {
        this.cancelRequested = cancelRequested;
    }

    public ExecutionRunEntity getCurrentRun() {
        return currentRun;
    }

    public void setCurrentRun(ExecutionRunEntity currentRun) {
        this.currentRun = currentRun;
    }

    public String getLatestSummary() {
        return latestSummary;
    }

    public void setLatestSummary(String latestSummary) {
        this.latestSummary = latestSummary;
    }

    public String getInputPayload() {
        return inputPayload;
    }

    public void setInputPayload(String inputPayload) {
        this.inputPayload = inputPayload;
    }

    public String getAgentBindingPayload() {
        return agentBindingPayload;
    }

    public void setAgentBindingPayload(String agentBindingPayload) {
        this.agentBindingPayload = agentBindingPayload;
    }

    public ExecutionOrchestrationVersionEntity getOrchestrationVersion() { return orchestrationVersion; }

    public void setOrchestrationVersion(ExecutionOrchestrationVersionEntity orchestrationVersion) {
        this.orchestrationVersion = orchestrationVersion;
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
