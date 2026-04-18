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
     * 当前步骤内部进度百分比。
     * 例如仓库 clone 和扫描阶段会在同一步内持续推进，前端需要展示更细粒度进度。
     */
    @Column(name = "progress_percent", nullable = false)
    private Integer progressPercent = 0;

    /**
     * 当前步骤最近一条进度说明。
     * 该字段用于在执行中心详情页展示更贴近用户的实时状态。
     */
    @Column(name = "latest_message", nullable = false, length = 1000)
    private String latestMessage = "";

    /**
     * 当前步骤绑定的 runner 会话标识。
     * 流式 CLI runner 会通过该字段把事件回调到具体步骤。
     */
    @Column(name = "runner_session_id", length = 120)
    private String runnerSessionId;

    /**
     * 执行 runner 类型，例如 CLI。
     */
    @Column(name = "runner_type", nullable = false, length = 40)
    private String runnerType = "";

    /**
     * 当前正在执行的命令。
     * 前端首屏优先展示该摘要，而不是直接渲染完整日志。
     */
    @Column(name = "current_command", nullable = false, length = 1000)
    private String currentCommand = "";

    /**
     * 最近一次写入的事件序号。
     * SSE 重连与详情页首屏恢复都依赖这个游标。
     */
    @Column(name = "last_event_id")
    private Long lastEventId;

    /**
     * 最近收到任意事件的时间。
     */
    @Column(name = "last_event_at")
    private LocalDateTime lastEventAt;

    /**
     * 最近收到心跳事件的时间。
     * watchdog 会基于该字段判定流式 runner 是否失联。
     */
    @Column(name = "last_heartbeat_at")
    private LocalDateTime lastHeartbeatAt;

    /**
     * 尾日志快照。
     * 固定保留最近窗口，避免把整份 stdout/stderr 塞进 outputSnapshot。
     */
    @Column(name = "tail_log_text", columnDefinition = "TEXT")
    private String tailLogText;

    /**
     * 当前尾日志窗口中的行数。
     */
    @Column(name = "tail_log_line_count", nullable = false)
    private Integer tailLogLineCount = 0;

    /**
     * 是否有 live stream 能力。
     * 历史任务或同步快照步骤保持 false，前端据此决定是否展示心跳/尾日志提示。
     */
    @Column(name = "has_live_stream", nullable = false)
    private boolean hasLiveStream;

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

    public Integer getProgressPercent() {
        return progressPercent;
    }

    public void setProgressPercent(Integer progressPercent) {
        this.progressPercent = progressPercent;
    }

    public String getLatestMessage() {
        return latestMessage;
    }

    public void setLatestMessage(String latestMessage) {
        this.latestMessage = latestMessage;
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

    public String getRunnerSessionId() {
        return runnerSessionId;
    }

    public void setRunnerSessionId(String runnerSessionId) {
        this.runnerSessionId = runnerSessionId;
    }

    public String getRunnerType() {
        return runnerType;
    }

    public void setRunnerType(String runnerType) {
        this.runnerType = runnerType;
    }

    public String getCurrentCommand() {
        return currentCommand;
    }

    public void setCurrentCommand(String currentCommand) {
        this.currentCommand = currentCommand;
    }

    public Long getLastEventId() {
        return lastEventId;
    }

    public void setLastEventId(Long lastEventId) {
        this.lastEventId = lastEventId;
    }

    public LocalDateTime getLastEventAt() {
        return lastEventAt;
    }

    public void setLastEventAt(LocalDateTime lastEventAt) {
        this.lastEventAt = lastEventAt;
    }

    public LocalDateTime getLastHeartbeatAt() {
        return lastHeartbeatAt;
    }

    public void setLastHeartbeatAt(LocalDateTime lastHeartbeatAt) {
        this.lastHeartbeatAt = lastHeartbeatAt;
    }

    public String getTailLogText() {
        return tailLogText;
    }

    public void setTailLogText(String tailLogText) {
        this.tailLogText = tailLogText;
    }

    public Integer getTailLogLineCount() {
        return tailLogLineCount;
    }

    public void setTailLogLineCount(Integer tailLogLineCount) {
        this.tailLogLineCount = tailLogLineCount;
    }

    public boolean isHasLiveStream() {
        return hasLiveStream;
    }

    public void setHasLiveStream(boolean hasLiveStream) {
        this.hasLiveStream = hasLiveStream;
    }
}
