package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 到期工作区清理调度需要和真实持久化状态一起验证，
 * 避免只测 mock 交互时漏掉状态流转、错误落库或旧错误信息清理。
 */
@SpringBootTest(properties = "platform.execution.workspace-cleanup.scheduler-enabled=true")
@Transactional
class ExecutionWorkspaceCleanupSchedulerTests {

    @Autowired
    private ExecutionWorkspaceCleanupScheduler executionWorkspaceCleanupScheduler;

    @Autowired
    private ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository;

    @MockBean
    private ExecutionWorkspaceCleanupClientService executionWorkspaceCleanupClientService;

    /**
     * Task 4 删除接口尚未交付前，调度器默认必须禁用，
     * 否则发布后会把所有过期记录都打成 DELETE_FAILED。
     */
    @Test
    void shouldSkipScanningWhenSchedulerIsDisabled() {
        ExecutionWorkspaceCleanupService cleanupService = mock(ExecutionWorkspaceCleanupService.class);
        ExecutionWorkspaceCleanupClientService clientService = mock(ExecutionWorkspaceCleanupClientService.class);
        ExecutionWorkspaceCleanupScheduler scheduler = new ExecutionWorkspaceCleanupScheduler(
                cleanupService,
                clientService,
                20,
                false
        );

        scheduler.cleanupExpiredExecutionWorkspaces();

        verify(cleanupService, never()).findExpiredScheduledWorkspaces(any(), anyInt());
        verify(clientService, never()).cleanupWorkspace(any());
    }

    /**
     * code-processing 删除成功后，backend 应把记录落成 DELETED，
     * 同时写入删除时间并清空历史删除失败信息。
     */
    @Test
    void shouldMarkWorkspaceDeletedWhenCleanupEndpointSucceeds() {
        ExecutionWorkspaceCleanupEntity record = saveExpiredScheduledRecord("C:/workspace/task-99/run-301/repo-demo");

        executionWorkspaceCleanupScheduler.cleanupExpiredExecutionWorkspaces();

        ExecutionWorkspaceCleanupEntity saved = executionWorkspaceCleanupRepository.findById(record.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("DELETED");
        assertThat(saved.getDeletedAt()).isNotNull();
        assertThat(saved.getDeleteFailedAt()).isNull();
        assertThat(saved.getDeleteErrorMessage()).isNull();
        verify(executionWorkspaceCleanupClientService).cleanupWorkspace("C:/workspace/task-99/run-301/repo-demo");
    }

    /**
     * 删除请求失败时，本轮调度不应继续把该记录当作 SCHEDULED 重试，
     * 而是直接沉淀 DELETE_FAILED、失败时间和错误信息等待后续人工处理。
     */
    @Test
    void shouldMarkWorkspaceDeleteFailedWithoutRetryWhenCleanupEndpointFails() {
        ExecutionWorkspaceCleanupEntity record = saveExpiredScheduledRecord("C:/workspace/task-99/run-302/repo-demo");
        doThrow(new IllegalStateException("目录被占用"))
                .when(executionWorkspaceCleanupClientService)
                .cleanupWorkspace("C:/workspace/task-99/run-302/repo-demo");

        executionWorkspaceCleanupScheduler.cleanupExpiredExecutionWorkspaces();

        ExecutionWorkspaceCleanupEntity saved = executionWorkspaceCleanupRepository.findById(record.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("DELETE_FAILED");
        assertThat(saved.getDeletedAt()).isNull();
        assertThat(saved.getDeleteFailedAt()).isNotNull();
        assertThat(saved.getDeleteErrorMessage()).contains("目录被占用");
        verify(executionWorkspaceCleanupClientService).cleanupWorkspace("C:/workspace/task-99/run-302/repo-demo");
    }

    /**
     * 如果远端删除已经成功，而本地 markDeleted 落库失败，
     * 不能反过来把这次成功删除误记成 DELETE_FAILED。
     */
    @Test
    void shouldNotMarkDeleteFailedWhenMarkDeletedPersistenceFailsAfterRemoteSuccess() {
        ExecutionWorkspaceCleanupEntity record = new ExecutionWorkspaceCleanupEntity();
        record.setId(91L);
        record.setWorkspaceRoot("C:/workspace/task-99/run-303/repo-demo");
        record.setStatus(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);

        ExecutionWorkspaceCleanupService cleanupService = mock(ExecutionWorkspaceCleanupService.class);
        ExecutionWorkspaceCleanupClientService clientService = mock(ExecutionWorkspaceCleanupClientService.class);
        when(cleanupService.findExpiredScheduledWorkspaces(any(), anyInt())).thenReturn(List.of(record));
        doThrow(new IllegalStateException("数据库写入失败"))
                .when(cleanupService)
                .markDeleted(any(), any());
        ExecutionWorkspaceCleanupScheduler scheduler = new ExecutionWorkspaceCleanupScheduler(
                cleanupService,
                clientService,
                20,
                true
        );

        assertThatThrownBy(scheduler::cleanupExpiredExecutionWorkspaces)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("数据库写入失败");
        verify(clientService).cleanupWorkspace("C:/workspace/task-99/run-303/repo-demo");
        verify(cleanupService, never()).markDeleteFailed(any(), any(), any());
    }

    private ExecutionWorkspaceCleanupEntity saveExpiredScheduledRecord(String workspaceRoot) {
        LocalDateTime now = LocalDateTime.now();
        ExecutionWorkspaceCleanupEntity entity = new ExecutionWorkspaceCleanupEntity();
        entity.setExecutionTaskId(99L);
        entity.setExecutionRunId(workspaceRoot.contains("302") ? 302L : 301L);
        entity.setExecutionStepId(401L);
        entity.setRunnerSessionId("session-cleanup");
        entity.setWorkspaceRoot(workspaceRoot);
        entity.setStatus(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        entity.setExecutionResultStatus("SUCCESS");
        entity.setScheduledAt(now.minusHours(24));
        entity.setExpiresAt(now.minusMinutes(5));
        entity.setDeleteErrorMessage("上一次失败残留");
        return executionWorkspaceCleanupRepository.saveAndFlush(entity);
    }
}
