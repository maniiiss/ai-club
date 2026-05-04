package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class ExecutionWorkspaceCleanupService {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_SCHEDULED = "SCHEDULED";

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

        entity.setExecutionTaskId(taskId);
        entity.setExecutionRunId(runId);
        entity.setExecutionStepId(stepId);
        entity.setRunnerSessionId(trimToNull(sessionId));
        entity.setWorkspaceRoot(normalizedWorkspaceRoot);
        entity.setStatus(STATUS_ACTIVE);
        entity.setExecutionResultStatus(null);
        entity.setScheduledAt(null);
        entity.setExpiresAt(null);
        entity.setDeleteErrorMessage(null);
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
            entity.setDeleteErrorMessage(null);
        }
        executionWorkspaceCleanupRepository.saveAll(activeWorkspaces);
        return activeWorkspaces.size();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
