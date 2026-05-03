package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionStepEventEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepEventRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖执行事件写入时的序号分配与 run 级串行化逻辑。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionEventServiceTests {

    @Mock
    private ExecutionStepEventRepository executionStepEventRepository;

    @Mock
    private ExecutionStepRepository executionStepRepository;

    @Mock
    private ExecutionRunRepository executionRunRepository;

    @Mock
    private ExecutionTaskRepository executionTaskRepository;

    private ExecutionEventService executionEventService;

    @BeforeEach
    void setUp() {
        executionEventService = new ExecutionEventService(
                executionStepEventRepository,
                executionStepRepository,
                executionRunRepository,
                executionTaskRepository,
                new ObjectMapper()
        );
    }

    /**
     * sequence_no 现在依赖数据库锁串行化，同一 run 的事件写入必须先锁 run 再查询最大序号。
     */
    @Test
    void shouldLockRunBeforeAllocatingNextSequenceNumber() {
        ExecutionTaskEntity task = new ExecutionTaskEntity();
        task.setId(301L);

        ExecutionRunEntity originalRun = new ExecutionRunEntity();
        originalRun.setId(44L);
        originalRun.setExecutionTask(task);

        ExecutionRunEntity lockedRun = new ExecutionRunEntity();
        lockedRun.setId(44L);
        lockedRun.setExecutionTask(task);

        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setId(88L);
        step.setRun(lockedRun);
        step.setStepName("执行规划");
        step.setProgressPercent(20);

        ExecutionStepEventEntity lastEvent = new ExecutionStepEventEntity();
        lastEvent.setSequenceNo(12L);

        when(executionRunRepository.findByIdForUpdate(44L)).thenReturn(Optional.of(lockedRun));
        when(executionStepEventRepository.findFirstByRun_IdOrderBySequenceNoDesc(44L)).thenReturn(Optional.of(lastEvent));
        when(executionStepRepository.findById(88L)).thenReturn(Optional.of(step));
        when(executionStepEventRepository.save(any(ExecutionStepEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ObjectNode payload = new ObjectMapper().createObjectNode().put("summary", "runner event");
        var event = executionEventService.appendEvent(task, originalRun, step, "step_summary_updated", "system", payload);

        InOrder inOrder = inOrder(executionRunRepository, executionStepEventRepository);
        inOrder.verify(executionRunRepository).findByIdForUpdate(44L);
        inOrder.verify(executionStepEventRepository).findFirstByRun_IdOrderBySequenceNoDesc(44L);
        verify(executionStepEventRepository).save(any(ExecutionStepEventEntity.class));
        assertThat(step.getLastEventId()).isEqualTo(13L);
        assertThat(event.stepName()).isEqualTo("执行规划");
    }

    /**
     * /complete 成功收口后，迟到的 stdout/heartbeat 仍可能在网络层补到 backend；
     * 事件落库只能更新运行态元数据，不能把终态步骤覆写回 RUNNING。
     */
    @Test
    void shouldPreserveTerminalStepStatusWhenLateRunnerEventUsesStaleStepSnapshot() {
        ExecutionTaskEntity task = new ExecutionTaskEntity();
        task.setId(401L);

        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(55L);
        run.setExecutionTask(task);

        ExecutionRunEntity lockedRun = new ExecutionRunEntity();
        lockedRun.setId(55L);
        lockedRun.setExecutionTask(task);

        ExecutionStepEntity staleStep = new ExecutionStepEntity();
        staleStep.setId(99L);
        staleStep.setRun(lockedRun);
        staleStep.setStatus("RUNNING");
        staleStep.setCurrentCommand("Playwright 仓库自动化");
        staleStep.setLatestMessage("执行中：Playwright 仓库自动化");
        staleStep.setProgressPercent(90);

        ExecutionStepEntity persistedStep = new ExecutionStepEntity();
        persistedStep.setId(99L);
        persistedStep.setRun(lockedRun);
        persistedStep.setStatus("SUCCESS");
        persistedStep.setLatestMessage("测试执行完成");
        persistedStep.setProgressPercent(100);

        when(executionRunRepository.findByIdForUpdate(55L)).thenReturn(Optional.of(lockedRun));
        when(executionStepEventRepository.findFirstByRun_IdOrderBySequenceNoDesc(55L)).thenReturn(Optional.empty());
        when(executionStepRepository.findById(99L)).thenReturn(Optional.of(persistedStep));
        when(executionStepEventRepository.save(any(ExecutionStepEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        executionEventService.appendEvent(
                task,
                run,
                staleStep,
                "stdout_chunk",
                "stdout",
                new ObjectMapper().createObjectNode().put("text", "late output")
        );

        assertThat(persistedStep.getStatus()).isEqualTo("SUCCESS");
        assertThat(persistedStep.getCurrentCommand()).isEqualTo("Playwright 仓库自动化");
        assertThat(persistedStep.getLastEventId()).isEqualTo(1L);
        assertThat(staleStep.getStatus()).isEqualTo("RUNNING");
        verify(executionStepRepository).save(persistedStep);
    }
}
