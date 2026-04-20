package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.request.ExecutionSessionCompleteRequest;
import com.aiclub.platform.dto.request.ExecutionSessionEventRequest;
import com.aiclub.platform.dto.request.ExecutionSessionEventsRequest;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
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
 * 覆盖异步 runner 事件回调对 heartbeat/watchdog 的续命逻辑。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionAsyncSessionServiceTests {

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    @Mock
    private ExecutionEventService executionEventService;

    private ExecutionAsyncSessionService executionAsyncSessionService;

    @BeforeEach
    void setUp() {
        executionAsyncSessionService = new ExecutionAsyncSessionService(
                executionStepRepository,
                executionRunRepository,
                executionTaskRepository,
                executionArtifactRepository,
                executionEventService
        );
    }

    /**
     * 只要 runner 仍有任意事件回调，就说明会话还活着；
     * 即使这批事件里没有显式 heartbeat，也要刷新 lastHeartbeatAt，避免 watchdog 误判失联。
     */
    @Test
    void shouldRefreshHeartbeatTimestampWhenReceivingAnyRunnerEvents() {
        ExecutionTaskEntity task = new ExecutionTaskEntity();
        task.setId(101L);

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(44L);
        run.setExecutionTask(task);

        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setId(12L);
        step.setRun(run);
        step.setRunnerSessionId("session-1");
        step.setLastHeartbeatAt(LocalDateTime.now().minusMinutes(5));

        when(executionStepRepository.findByRunnerSessionId("session-1")).thenReturn(Optional.of(step));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        executionAsyncSessionService.recordRunnerEvents(
                "session-1",
                new ExecutionSessionEventsRequest(List.of(
                        new ExecutionSessionEventRequest(
                                "progress_changed",
                                "system",
                                "",
                                "",
                                20,
                                "正在结构化仓库",
                                null
                        )
                ))
        );

        assertThat(step.getLastHeartbeatAt()).isAfter(LocalDateTime.now().minusSeconds(5));
        verify(executionStepRepository).save(step);
        verify(executionEventService).recordRunnerEvents(task, run, step, List.of(
                new ExecutionSessionEventRequest(
                        "progress_changed",
                        "system",
                        "",
                        "",
                        20,
                        "正在结构化仓库",
                        null
                )
        ));
    }

    /**
     * 主动取消 live step 后，迟到的 complete 回调不应再把步骤状态覆盖回成功或失败。
     */
    @Test
    void shouldCancelLiveStepAndIgnoreLateRunnerCompletion() {
        ExecutionTaskEntity task = new ExecutionTaskEntity();
        task.setId(201L);
        task.setStatus("RUNNING");
        task.setLatestSummary("执行中：开发实现");

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(88L);
        run.setExecutionTask(task);
        run.setStatus("RUNNING");
        run.setCurrentStepNo(3);

        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setId(33L);
        step.setRun(run);
        step.setStatus("RUNNING");
        step.setRunnerSessionId("session-cancel");
        step.setHasLiveStream(true);
        step.setLatestMessage("执行中");
        step.setProgressPercent(42);

        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.findByRunnerSessionId("session-cancel")).thenReturn(Optional.of(step));

        boolean canceled = executionAsyncSessionService.cancelLiveStep(task, run, step, "执行任务已取消，当前步骤正在停止");

        assertThat(canceled).isTrue();
        assertThat(step.getStatus()).isEqualTo("CANCELED");
        assertThat(run.getStatus()).isEqualTo("CANCELED");
        assertThat(task.getStatus()).isEqualTo("CANCELED");

        executionAsyncSessionService.completeRunnerSession(
                "session-cancel",
                new ExecutionSessionCompleteRequest(
                        "SUCCESS",
                        "迟到回调",
                        "不应覆盖取消态",
                        "",
                        List.of()
                )
        );

        assertThat(step.getStatus()).isEqualTo("CANCELED");
        assertThat(run.getStatus()).isEqualTo("CANCELED");
        assertThat(task.getStatus()).isEqualTo("CANCELED");
        verify(executionEventService, never()).recordStepFinished(task, run, step, "迟到回调");
    }
}
