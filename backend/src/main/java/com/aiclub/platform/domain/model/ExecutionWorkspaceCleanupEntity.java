package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * 执行工作区清理记录。
 * 用于把运行期工作目录的登记、调度和删除失败信息统一沉淀到数据库，便于后续异步清理器接管。
 */
@Entity
@Table(
        name = "execution_workspace_cleanup",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_execution_workspace_cleanup_run_root", columnNames = {"execution_run_id", "workspace_root"})
        }
)
public class ExecutionWorkspaceCleanupEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属执行任务主键。
     * 这里保留直接 ID，而不是强耦合实体关系，便于后续清理任务按最小查询成本做批处理。
     */
    @Column(name = "execution_task_id", nullable = false)
    private Long executionTaskId;

    /**
     * 所属执行运行主键。
     */
    @Column(name = "execution_run_id", nullable = false)
    private Long executionRunId;

    /**
     * 最近一次登记该工作区的步骤主键。
     * 同一个 run 里可能由不同 step/session 复用同一目录，因此这里只保留最新关联。
     */
    @Column(name = "execution_step_id")
    private Long executionStepId;

    /**
     * 最近一次回报该工作区的 runner 会话 ID。
     */
    @Column(name = "runner_session_id", length = 120)
    private String runnerSessionId;

    /**
     * 工作区根目录绝对路径。
     */
    @Column(name = "workspace_root", nullable = false, length = 1000)
    private String workspaceRoot;

    /**
     * 清理状态。
     * 第一阶段仅使用 ACTIVE 和 SCHEDULED，后续删除执行器会继续扩展生命周期。
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status = "ACTIVE";

    /**
     * 触发清理时对应的执行结果状态，例如 SUCCESS / FAILED / CANCELED。
     */
    @Column(name = "execution_result_status", length = 20)
    private String executionResultStatus;

    /**
     * 被加入清理队列的时间。
     */
    @Column(name = "scheduled_at")
    private LocalDateTime scheduledAt;

    /**
     * 工作区最早允许被删除的时间。
     * 该字段由保留时长策略推导，避免调度器和执行器各自重复计算。
     */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /**
     * 最近一次删除失败原因。
     * 当重新进入调度阶段时需要清空，避免历史错误误导当前状态。
     */
    @Column(name = "delete_error_message", columnDefinition = "TEXT")
    private String deleteErrorMessage;

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

    public Long getExecutionTaskId() {
        return executionTaskId;
    }

    public void setExecutionTaskId(Long executionTaskId) {
        this.executionTaskId = executionTaskId;
    }

    public Long getExecutionRunId() {
        return executionRunId;
    }

    public void setExecutionRunId(Long executionRunId) {
        this.executionRunId = executionRunId;
    }

    public Long getExecutionStepId() {
        return executionStepId;
    }

    public void setExecutionStepId(Long executionStepId) {
        this.executionStepId = executionStepId;
    }

    public String getRunnerSessionId() {
        return runnerSessionId;
    }

    public void setRunnerSessionId(String runnerSessionId) {
        this.runnerSessionId = runnerSessionId;
    }

    public String getWorkspaceRoot() {
        return workspaceRoot;
    }

    public void setWorkspaceRoot(String workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getExecutionResultStatus() {
        return executionResultStatus;
    }

    public void setExecutionResultStatus(String executionResultStatus) {
        this.executionResultStatus = executionResultStatus;
    }

    public LocalDateTime getScheduledAt() {
        return scheduledAt;
    }

    public void setScheduledAt(LocalDateTime scheduledAt) {
        this.scheduledAt = scheduledAt;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public String getDeleteErrorMessage() {
        return deleteErrorMessage;
    }

    public void setDeleteErrorMessage(String deleteErrorMessage) {
        this.deleteErrorMessage = deleteErrorMessage;
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
