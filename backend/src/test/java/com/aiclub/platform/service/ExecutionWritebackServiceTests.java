package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.TaskCommentRepository;
import com.aiclub.platform.repository.TaskRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 验证开发执行第一版不会把执行结果回写到工作项评论。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionWritebackServiceTests {

    @Mock
    private TaskCommentRepository taskCommentRepository;

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;

    /**
     * 开发执行闭环的结果仅保留在执行详情中，不新增评论也不修改产物回写标记。
     */
    @Test
    void shouldSkipWritebackForDevelopmentImplementationScenario() {
        ExecutionWritebackService executionWritebackService = new ExecutionWritebackService(
                taskCommentRepository,
                taskRepository,
                executionArtifactRepository
        );
        TaskEntity workItem = new TaskEntity();
        workItem.setId(100L);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        executionTask.setWorkItem(workItem);
        ExecutionRunEntity executionRun = new ExecutionRunEntity();

        executionWritebackService.writeBackToWorkItem(executionTask, executionRun, List.of());

        verifyNoInteractions(taskCommentRepository, taskRepository, executionArtifactRepository);
    }

    /**
     * 技术设计必须等待用户确认后走专用写回接口，终态收口不能自动追加摘要评论。
     */
    @Test
    void shouldSkipAutomaticWritebackForTechnicalDesignScenario() {
        ExecutionWritebackService executionWritebackService = new ExecutionWritebackService(
                taskCommentRepository,
                taskRepository,
                executionArtifactRepository
        );
        TaskEntity workItem = new TaskEntity();
        workItem.setId(101L);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setScenarioCode(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING);
        executionTask.setWorkItem(workItem);

        executionWritebackService.writeBackToWorkItem(executionTask, new ExecutionRunEntity(), List.of());

        verifyNoInteractions(taskCommentRepository, taskRepository, executionArtifactRepository);
    }
}
