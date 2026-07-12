package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 需求 AI 执行的创建与恢复查询入口。
 * 当前先集中负责创建，历史和结果查询在同一服务中继续扩展。
 */
@Service
public class RequirementAiExecutionQueryService {

    private final TaskRequirementAiService taskRequirementAiService;
    private final ExecutionTaskService executionTaskService;
    private final AuthService authService;

    public RequirementAiExecutionQueryService(TaskRequirementAiService taskRequirementAiService,
                                              ExecutionTaskService executionTaskService,
                                              AuthService authService) {
        this.taskRequirementAiService = taskRequirementAiService;
        this.executionTaskService = executionTaskService;
        this.authService = authService;
    }

    public ExecutionTaskSummary create(Long taskId, TaskRequirementAiRequest request, boolean publicSurface) {
        if (publicSurface && request.modelConfigId() != null) {
            throw new IllegalArgumentException("公众端不允许指定需求 AI 模型");
        }
        TaskRequirementAiRequest effectiveRequest = publicSurface
                ? new TaskRequirementAiRequest(request.action(), null)
                : request;
        TaskRequirementAiService.RequirementAiExecutionSubmission submission =
                taskRequirementAiService.prepareExecutionSubmission(taskId, effectiveRequest);
        CurrentUserInfo currentUser = authService.currentUser();

        Map<String, Object> inputPayload = new LinkedHashMap<>();
        inputPayload.put("action", effectiveRequest.action());
        inputPayload.put("modelConfigId", submission.modelConfigId());
        inputPayload.put("taskSnapshot", submission.taskSnapshot());
        inputPayload.put("publicSurface", publicSurface);

        ExecutionTaskEntity created = executionTaskService.createInternalExecutionTask(
                new ExecutionTaskService.InternalCreateExecutionTaskCommand(
                        ExecutionWorkflowService.SCENARIO_REQUIREMENT_AI_ANALYSIS,
                        submission.task().getProject().getId(),
                        submission.task().getId(),
                        submission.task().getName() + " · 需求 AI 分析",
                        publicSurface ? "PUBLIC_REQUIREMENT_AI" : "MANAGEMENT_REQUIREMENT_AI",
                        "REQUIREMENT_AI",
                        submission.task().getId(),
                        currentUser.id(),
                        false,
                        List.of(),
                        inputPayload
                )
        );
        return executionTaskService.getExecutionTaskSummary(created.getId());
    }
}
