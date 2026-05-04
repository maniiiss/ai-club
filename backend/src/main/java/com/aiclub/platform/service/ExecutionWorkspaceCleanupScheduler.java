package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 周期性扫描已到期的执行工作区，并委托 code-processing 执行实际目录删除。
 */
@Service
public class ExecutionWorkspaceCleanupScheduler {

    private final ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;
    private final ExecutionWorkspaceCleanupClientService executionWorkspaceCleanupClientService;
    private final int batchSize;

    public ExecutionWorkspaceCleanupScheduler(
            ExecutionWorkspaceCleanupService executionWorkspaceCleanupService,
            ExecutionWorkspaceCleanupClientService executionWorkspaceCleanupClientService,
            @Value("${platform.execution.workspace-cleanup.batch-size:20}") int batchSize
    ) {
        this.executionWorkspaceCleanupService = executionWorkspaceCleanupService;
        this.executionWorkspaceCleanupClientService = executionWorkspaceCleanupClientService;
        this.batchSize = batchSize <= 0 ? 20 : batchSize;
    }

    /**
     * 分批处理已到期的工作区，避免单次调度拉取过多记录。
     */
    @Scheduled(fixedDelayString = "${platform.execution.workspace-cleanup.cleanup-fixed-delay-ms:300000}")
    public void cleanupExpiredExecutionWorkspaces() {
        LocalDateTime queryAt = LocalDateTime.now();
        List<ExecutionWorkspaceCleanupEntity> expiredWorkspaces =
                executionWorkspaceCleanupService.findExpiredScheduledWorkspaces(queryAt, batchSize);
        for (ExecutionWorkspaceCleanupEntity workspace : expiredWorkspaces) {
            processWorkspace(workspace);
        }
    }

    private void processWorkspace(ExecutionWorkspaceCleanupEntity workspace) {
        LocalDateTime processedAt = LocalDateTime.now();
        try {
            executionWorkspaceCleanupClientService.cleanupWorkspace(workspace.getWorkspaceRoot());
            executionWorkspaceCleanupService.markDeleted(workspace.getId(), processedAt);
        } catch (RuntimeException exception) {
            executionWorkspaceCleanupService.markDeleteFailed(
                    workspace.getId(),
                    processedAt,
                    resolveDeleteErrorMessage(exception)
            );
        }
    }

    private String resolveDeleteErrorMessage(RuntimeException exception) {
        if (exception == null) {
            return "删除执行工作区失败";
        }
        String message = exception.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "删除执行工作区失败";
        }
        return message.trim();
    }
}
