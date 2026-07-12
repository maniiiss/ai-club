package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.RequirementAiPreparedContext;
import com.aiclub.platform.dto.RequirementAiTaskSnapshot;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RequirementAiExecutionServiceTests {

    @Mock
    private RequirementAiContextService requirementAiContextService;
    @Mock
    private TaskRequirementAiService taskRequirementAiService;
    @Mock
    private AgentExecutionService agentExecutionService;
    @Mock
    private DocumentAssetService documentAssetService;
    @Mock
    private ExecutionStepRepository executionStepRepository;
    @Mock
    private ExecutionRunRepository executionRunRepository;
    @Mock
    private ExecutionArtifactRepository executionArtifactRepository;
    @Mock
    private ExecutionTaskRepository executionTaskRepository;
    @Mock
    private ExecutionEventService executionEventService;

    private RequirementAiExecutionService executionService;

    @BeforeEach
    void setUp() {
        executionService = new RequirementAiExecutionService(
                requirementAiContextService,
                taskRequirementAiService,
                agentExecutionService,
                documentAssetService,
                executionStepRepository,
                executionRunRepository,
                executionArtifactRepository,
                executionTaskRepository,
                executionEventService,
                new ObjectMapper()
        );
        when(executionStepRepository.save(any(ExecutionStepEntity.class))).thenAnswer(invocation -> {
            ExecutionStepEntity step = invocation.getArgument(0);
            if (step.getId() == null) step.setId((long) (100 + step.getStepNo()));
            return step;
        });
        when(executionArtifactRepository.save(any(ExecutionArtifactEntity.class))).thenAnswer(invocation -> {
            ExecutionArtifactEntity artifact = invocation.getArgument(0);
            if (artifact.getId() == null) artifact.setId((long) (200 + artifact.getArtifactType().hashCode() & 0x7fffffff));
            return artifact;
        });
        when(executionRunRepository.save(any(ExecutionRunEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(executionTaskRepository.save(any(ExecutionTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    /**
     * 没有平台图片时图片理解步骤应明确标记为 SKIPPED，但仍保留三类不可变产物供追溯。
     */
    @Test
    void shouldSkipVisionAndPersistImmutableArtifactsWhenNoImages() {
        ExecutionTaskEntity task = executionTask();
        ExecutionRunEntity run = new ExecutionRunEntity();
        run.setId(31L);
        run.setExecutionTask(task);
        RequirementAiTaskSnapshot snapshot = new RequirementAiTaskSnapshot(
                6L, "STANDARDIZE", "登录需求", "需求", null, "演示项目", "未规划",
                "草稿", "高", "", "支持账号密码登录", null, null);
        RequirementAiPreparedContext context = new RequirementAiPreparedContext(
                "需求标题：登录需求", List.of(), Map.of("attachmentIncluded", 0), List.of());
        TaskRequirementAiResult aiResult = new TaskRequirementAiResult(
                "STANDARDIZE", "标准化需求", "# 登录需求", 9L, "主模型", List.of(), List.of());
        when(requirementAiContextService.prepare(snapshot)).thenReturn(context);
        when(taskRequirementAiService.generatePrepared(eq(task.getWorkItem()), eq("STANDARDIZE"), eq(9L), any(RequirementAiPreparedContext.class)))
                .thenReturn(aiResult);

        RequirementAiExecutionService.RequirementAiExecutionResult result = executionService.executeRequirementAiTask(
                task,
                run,
                workflowPlan()
        );

        assertThat(result.canceled()).isFalse();
        assertThat(result.summary()).contains("标准化需求");
        assertThat(result.artifacts()).extracting(ExecutionArtifactEntity::getArtifactType)
                .containsExactly(
                        RequirementAiExecutionService.ARTIFACT_REQUIREMENT_CONTEXT,
                        RequirementAiExecutionService.ARTIFACT_IMAGE_ANALYSIS,
                        RequirementAiExecutionService.ARTIFACT_REQUIREMENT_AI_RESULT
                );
        ArgumentCaptor<ExecutionStepEntity> stepCaptor = ArgumentCaptor.forClass(ExecutionStepEntity.class);
        verify(executionStepRepository, org.mockito.Mockito.atLeast(3)).save(stepCaptor.capture());
        assertThat(stepCaptor.getAllValues()).anyMatch(step ->
                ExecutionWorkflowService.STEP_VISION_ANALYZE.equals(step.getStepCode()) && "SKIPPED".equals(step.getStatus()));
    }

    private ExecutionTaskEntity executionTask() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "");
        project.setId(7L);
        TaskEntity workItem = new TaskEntity();
        workItem.setId(6L);
        workItem.setName("登录需求");
        workItem.setWorkItemType("需求");
        workItem.setProject(project);
        ExecutionTaskEntity task = new ExecutionTaskEntity();
        task.setId(21L);
        task.setTitle("登录需求 AI 分析");
        task.setScenarioCode(ExecutionWorkflowService.SCENARIO_REQUIREMENT_AI_ANALYSIS);
        task.setProject(project);
        task.setWorkItem(workItem);
        task.setInputPayload("""
                {
                  "action": "STANDARDIZE",
                  "modelConfigId": 9,
                  "taskSnapshot": {
                    "taskId": 6,
                    "action": "STANDARDIZE",
                    "name": "登录需求",
                    "workItemType": "需求",
                    "projectName": "演示项目",
                    "iterationName": "未规划",
                    "status": "草稿",
                    "priority": "高",
                    "prototypeUrl": "",
                    "description": "支持账号密码登录"
                  }
                }
                """);
        return task;
    }

    private ExecutionWorkflowService.WorkflowPlan workflowPlan() {
        return new ExecutionWorkflowService.WorkflowPlan(
                ExecutionWorkflowService.SCENARIO_REQUIREMENT_AI_ANALYSIS,
                "需求 AI 分析",
                List.of(
                        new ExecutionWorkflowService.ExecutionStepPlan(1, ExecutionWorkflowService.STEP_CONTEXT_PREPARE, "上下文准备", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(2, ExecutionWorkflowService.STEP_VISION_ANALYZE, "图片理解", null, null, null, null),
                        new ExecutionWorkflowService.ExecutionStepPlan(3, ExecutionWorkflowService.STEP_REQUIREMENT_GENERATE, "需求生成", null, null, null, null)
                )
        );
    }
}
