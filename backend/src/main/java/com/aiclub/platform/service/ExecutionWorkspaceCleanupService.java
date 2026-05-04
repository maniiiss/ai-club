package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ExecutionWorkspaceCleanupService {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_SCHEDULED = "SCHEDULED";
    public static final String STATUS_DELETED = "DELETED";
    public static final String STATUS_DELETE_FAILED = "DELETE_FAILED";

    private final ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository;
    private final long retentionHours;

    public ExecutionWorkspaceCleanupService(
            ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository,
            @Value("${platform.execution.workspace-cleanup.retention-hours:24}") long retentionHours
    ) {
        this.executionWorkspaceCleanupRepository = executionWorkspaceCleanupRepository;
        this.retentionHours = retentionHours <= 0 ? 24 : retentionHours;
    }

    /**
     * 登记执行运行产生的工作区目录。
     * 同一个 run + workspaceRoot 只保留一条记录，避免多次回调把同一目录登记成多条待删任务。
     */
    @Transactional
    public ExecutionWorkspaceCleanupEntity registerWorkspace(Long taskId,
                                                             Long runId,
                                                             Long stepId,
                                                             String sessionId,
                                                             String workspaceRoot) {
        if (taskId == null) {
            throw new IllegalArgumentException("taskId 不能为空");
        }
        if (runId == null) {
            throw new IllegalArgumentException("runId 不能为空");
        }
        String normalizedWorkspaceRoot = trimToNull(workspaceRoot);
        if (normalizedWorkspaceRoot == null) {
            throw new IllegalArgumentException("workspaceRoot 不能为空");
        }

        ExecutionWorkspaceCleanupEntity entity = executionWorkspaceCleanupRepository
                .findByExecutionRunIdAndWorkspaceRoot(runId, normalizedWorkspaceRoot)
                .orElseGet(ExecutionWorkspaceCleanupEntity::new);
        boolean newRecord = entity.getId() == null;

        entity.setExecutionTaskId(taskId);
        entity.setExecutionRunId(runId);
        entity.setExecutionStepId(stepId);
        entity.setRunnerSessionId(trimToNull(sessionId));
        entity.setWorkspaceRoot(normalizedWorkspaceRoot);
        if (newRecord) {
            // 首次登记时才初始化清理生命周期，避免重复回调把已进入队列的记录误回滚成 ACTIVE。
            entity.setStatus(STATUS_ACTIVE);
            entity.setExecutionResultStatus(null);
            entity.setScheduledAt(null);
            entity.setExpiresAt(null);
            entity.setDeletedAt(null);
            entity.setDeleteFailedAt(null);
            entity.setDeleteErrorMessage(null);
        }
        return executionWorkspaceCleanupRepository.save(entity);
    }

    /**
     * 在运行收尾阶段把仍然 ACTIVE 的工作区切换为 SCHEDULED，
     * 让后续异步清理器只需要按状态和到期时间拉取即可。
     */
    @Transactional
    public int scheduleCleanupForRun(Long runId, String resultStatus, LocalDateTime scheduledAt) {
        if (runId == null) {
            throw new IllegalArgumentException("runId 不能为空");
        }
        if (scheduledAt == null) {
            throw new IllegalArgumentException("scheduledAt 不能为空");
        }

        List<ExecutionWorkspaceCleanupEntity> activeWorkspaces =
                executionWorkspaceCleanupRepository.findAllByExecutionRunIdAndStatusOrderByIdAsc(runId, STATUS_ACTIVE);
        if (activeWorkspaces.isEmpty()) {
            return 0;
        }

        String normalizedResultStatus = trimToNull(resultStatus);
        LocalDateTime expiresAt = scheduledAt.plusHours(retentionHours);
        for (ExecutionWorkspaceCleanupEntity entity : activeWorkspaces) {
            entity.setStatus(STATUS_SCHEDULED);
            entity.setExecutionResultStatus(normalizedResultStatus);
            entity.setScheduledAt(scheduledAt);
            entity.setExpiresAt(expiresAt);
            entity.setDeletedAt(null);
            entity.setDeleteFailedAt(null);
            entity.setDeleteErrorMessage(null);
        }
        executionWorkspaceCleanupRepository.saveAll(activeWorkspaces);
        return activeWorkspaces.size();
    }

    /**
     * 拉取已经到期且仍处于 SCHEDULED 状态的工作区，供调度器分批处理。
     */
    public List<ExecutionWorkspaceCleanupEntity> findExpiredScheduledWorkspaces(LocalDateTime now, int limit) {
        if (now == null) {
            throw new IllegalArgumentException("now 不能为空");
        }
        int normalizedLimit = limit <= 0 ? 20 : limit;
        return executionWorkspaceCleanupRepository.findAllByStatusAndExpiresAtLessThanEqualOrderByExpiresAtAscIdAsc(
                STATUS_SCHEDULED,
                now,
                PageRequest.of(0, normalizedLimit)
        );
    }

    /**
     * 删除成功后写入最终成功态，避免后续调度继续扫描这条记录。
     */
    @Transactional
    public boolean markDeleted(Long recordId, LocalDateTime deletedAt) {
        if (recordId == null) {
            throw new IllegalArgumentException("recordId 不能为空");
        }
        if (deletedAt == null) {
            throw new IllegalArgumentException("deletedAt 不能为空");
        }
        return executionWorkspaceCleanupRepository.markDeletedIfScheduled(
                recordId,
                STATUS_SCHEDULED,
                STATUS_DELETED,
                deletedAt
        ) > 0;
    }

    /**
     * 删除失败后沉淀失败时间与原因，供后续排障或人工处理。
     */
    @Transactional
    public boolean markDeleteFailed(Long recordId, LocalDateTime failedAt, String errorMessage) {
        if (recordId == null) {
            throw new IllegalArgumentException("recordId 不能为空");
        }
        if (failedAt == null) {
            throw new IllegalArgumentException("failedAt 不能为空");
        }
        return executionWorkspaceCleanupRepository.markDeleteFailedIfScheduled(
                recordId,
                STATUS_SCHEDULED,
                STATUS_DELETE_FAILED,
                failedAt,
                defaultDeleteErrorMessage(errorMessage)
        ) > 0;
    }

    private String defaultDeleteErrorMessage(String errorMessage) {
        String normalized = trimToNull(errorMessage);
        return normalized == null ? "删除执行工作区失败" : normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
