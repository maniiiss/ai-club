package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 工作区清理持久化底座的第一阶段先验证登记与调度规则，
 * 避免后续接入真实删除任务时把重复目录或错误保留期写入数据库。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionWorkspaceCleanupServiceTests {

    @Mock
    private ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository;

    private ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;

    @BeforeEach
    void setUp() {
        executionWorkspaceCleanupService = new ExecutionWorkspaceCleanupService(
                executionWorkspaceCleanupRepository,
                24
        );
    }

    /**
     * 同一次 run 下，同一个工作区根目录只能登记一条清理记录；
     * 如果 runner 重新回报了新的 step/session 关联，则应复用原记录并刷新关联信息。
     */
    @Test
    void shouldRegisterWorkspaceRootOncePerRun() {
        ExecutionWorkspaceCleanupEntity existing = new ExecutionWorkspaceCleanupEntity();
        existing.setId(10L);
        existing.setExecutionTaskId(101L);
        existing.setExecutionRunId(202L);
        existing.setExecutionStepId(11L);
        existing.setRunnerSessionId("session-old");
        existing.setWorkspaceRoot("C:/tmp/run-202/workspace-a");
        existing.setStatus(ExecutionWorkspaceCleanupService.STATUS_ACTIVE);

        when(executionWorkspaceCleanupRepository.findByExecutionRunIdAndWorkspaceRoot(202L, "C:/tmp/run-202/workspace-a"))
                .thenReturn(Optional.of(existing));
        when(executionWorkspaceCleanupRepository.save(any(ExecutionWorkspaceCleanupEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ExecutionWorkspaceCleanupEntity saved = executionWorkspaceCleanupService.registerWorkspace(
                101L,
                202L,
                12L,
                "session-new",
                "C:/tmp/run-202/workspace-a"
        );

        assertThat(saved.getId()).isEqualTo(10L);
        assertThat(saved.getExecutionTaskId()).isEqualTo(101L);
        assertThat(saved.getExecutionRunId()).isEqualTo(202L);
        assertThat(saved.getExecutionStepId()).isEqualTo(12L);
        assertThat(saved.getRunnerSessionId()).isEqualTo("session-new");
        assertThat(saved.getWorkspaceRoot()).isEqualTo("C:/tmp/run-202/workspace-a");
        assertThat(saved.getStatus()).isEqualTo(ExecutionWorkspaceCleanupService.STATUS_ACTIVE);
        verify(executionWorkspaceCleanupRepository).save(existing);
    }

    /**
     * 运行结束后只应调度仍处于 ACTIVE 的工作区，
     * 并统一补齐结果状态、计划删除时间和过期时间，方便后续清理任务批量拉取。
     */
    @Test
    void shouldScheduleActiveWorkspacesAfterRunFinishes() {
        LocalDateTime scheduledAt = LocalDateTime.of(2026, 5, 4, 9, 30, 0);

        ExecutionWorkspaceCleanupEntity first = activeWorkspace(1L, 300L, "C:/tmp/run-300/workspace-a");
        first.setDeleteErrorMessage("上次删除失败");
        ExecutionWorkspaceCleanupEntity second = activeWorkspace(2L, 300L, "C:/tmp/run-300/workspace-b");

        when(executionWorkspaceCleanupRepository.findAllByExecutionRunIdAndStatusOrderByIdAsc(
                300L,
                ExecutionWorkspaceCleanupService.STATUS_ACTIVE
        )).thenReturn(List.of(first, second));
        when(executionWorkspaceCleanupRepository.saveAll(any()))
                .thenAnswer(invocation -> invocation.getArgument(0));

        int scheduledCount = executionWorkspaceCleanupService.scheduleCleanupForRun(300L, "FAILED", scheduledAt);

        assertThat(scheduledCount).isEqualTo(2);
        assertThat(first.getStatus()).isEqualTo(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        assertThat(first.getExecutionResultStatus()).isEqualTo("FAILED");
        assertThat(first.getScheduledAt()).isEqualTo(scheduledAt);
        assertThat(first.getExpiresAt()).isEqualTo(scheduledAt.plusHours(24));
        assertThat(first.getDeleteErrorMessage()).isNull();

        assertThat(second.getStatus()).isEqualTo(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        assertThat(second.getExecutionResultStatus()).isEqualTo("FAILED");
        assertThat(second.getScheduledAt()).isEqualTo(scheduledAt);
        assertThat(second.getExpiresAt()).isEqualTo(scheduledAt.plusHours(24));

        verify(executionWorkspaceCleanupRepository).saveAll(List.of(first, second));
        verify(executionWorkspaceCleanupRepository, never()).save(any(ExecutionWorkspaceCleanupEntity.class));
    }

    private ExecutionWorkspaceCleanupEntity activeWorkspace(Long id, Long runId, String workspaceRoot) {
        ExecutionWorkspaceCleanupEntity entity = new ExecutionWorkspaceCleanupEntity();
        entity.setId(id);
        entity.setExecutionTaskId(900L);
        entity.setExecutionRunId(runId);
        entity.setExecutionStepId(901L);
        entity.setRunnerSessionId("session-" + id);
        entity.setWorkspaceRoot(workspaceRoot);
        entity.setStatus(ExecutionWorkspaceCleanupService.STATUS_ACTIVE);
        return entity;
    }
}
