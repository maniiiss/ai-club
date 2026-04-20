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
        step.setProgressPercent(20);

        ExecutionStepEventEntity lastEvent = new ExecutionStepEventEntity();
        lastEvent.setSequenceNo(12L);

        when(executionRunRepository.findByIdForUpdate(44L)).thenReturn(Optional.of(lockedRun));
        when(executionStepEventRepository.findFirstByRun_IdOrderBySequenceNoDesc(44L)).thenReturn(Optional.of(lastEvent));
        when(executionStepEventRepository.save(any(ExecutionStepEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ObjectNode payload = new ObjectMapper().createObjectNode().put("summary", "runner event");
        executionEventService.appendEvent(task, originalRun, step, "step_summary_updated", "system", payload);

        InOrder inOrder = inOrder(executionRunRepository, executionStepEventRepository);
        inOrder.verify(executionRunRepository).findByIdForUpdate(44L);
        inOrder.verify(executionStepEventRepository).findFirstByRun_IdOrderBySequenceNoDesc(44L);
        verify(executionStepEventRepository).save(any(ExecutionStepEventEntity.class));
        assertThat(step.getLastEventId()).isEqualTo(13L);
    }
}
