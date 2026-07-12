package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.RequirementAiTaskSnapshot;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RequirementAiExecutionQueryServiceTests {

    @Mock
    private TaskRequirementAiService taskRequirementAiService;
    @Mock
    private ExecutionTaskService executionTaskService;
    @Mock
    private AuthService authService;

    @Test
    void shouldSnapshotResolvedManagementModelWhenCreatingExecution() {
        RequirementAiExecutionQueryService service = new RequirementAiExecutionQueryService(
                taskRequirementAiService, executionTaskService, authService);
        TaskEntity task = task();
        RequirementAiTaskSnapshot snapshot = new RequirementAiTaskSnapshot(
                6L, "STANDARDIZE", "登录需求", "需求", null, "演示项目", "未规划",
                "草稿", "高", "", "支持登录", null, null);
        when(taskRequirementAiService.prepareExecutionSubmission(6L, new TaskRequirementAiRequest("STANDARDIZE", 9L)))
                .thenReturn(new TaskRequirementAiService.RequirementAiExecutionSubmission(task, snapshot, 9L));
        when(authService.currentUser()).thenReturn(currentUser());
        ExecutionTaskEntity created = new ExecutionTaskEntity();
        created.setId(21L);
        when(executionTaskService.createInternalExecutionTask(any())).thenReturn(created);
        when(executionTaskService.getExecutionTaskSummary(21L)).thenReturn(summary(21L));

        ExecutionTaskSummary result = service.create(6L, new TaskRequirementAiRequest("STANDARDIZE", 9L), false);

        assertThat(result.id()).isEqualTo(21L);
        ArgumentCaptor<ExecutionTaskService.InternalCreateExecutionTaskCommand> captor =
                ArgumentCaptor.forClass(ExecutionTaskService.InternalCreateExecutionTaskCommand.class);
        verify(executionTaskService).createInternalExecutionTask(captor.capture());
        assertThat(captor.getValue().inputPayload()).containsEntry("modelConfigId", 9L);
        assertThat(captor.getValue().scenarioCode()).isEqualTo(ExecutionWorkflowService.SCENARIO_REQUIREMENT_AI_ANALYSIS);
    }

    @Test
    void shouldRejectModelSelectionFromPublicSurface() {
        RequirementAiExecutionQueryService service = new RequirementAiExecutionQueryService(
                taskRequirementAiService, executionTaskService, authService);

        assertThatThrownBy(() -> service.create(6L, new TaskRequirementAiRequest("STANDARDIZE", 9L), true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("公众端不允许指定需求 AI 模型");
    }

    private TaskEntity task() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "");
        project.setId(7L);
        TaskEntity task = new TaskEntity();
        task.setId(6L);
        task.setName("登录需求");
        task.setWorkItemType("需求");
        task.setProject(project);
        return task;
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(3L, "user", "用户", "", "", "", "", true,
                List.of(), List.of(), List.of(), List.of());
    }

    private ExecutionTaskSummary summary(Long id) {
        return new ExecutionTaskSummary(id, "登录需求 AI 分析", ExecutionWorkflowService.SCENARIO_REQUIREMENT_AI_ANALYSIS,
                "需求 AI 分析", "REQUIREMENT_AI", 6L, 7L, "演示项目", 6L, "REQ-6", "登录需求",
                "PENDING", null, null, 0, null, null, "等待调度", false, false,
                3L, "用户", "", "");
    }
}
