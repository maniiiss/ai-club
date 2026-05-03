package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionTaskListStatsSummary;
import com.aiclub.platform.dto.ExecutionRunSummary;
import com.aiclub.platform.dto.ExecutionTaskDetail;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.ConfirmExecutionPlanRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.UpdateExecutionPlanMarkdownRequest;
import com.aiclub.platform.service.ExecutionTaskService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 执行中心任务控制器。
 */
@RestController
@RequestMapping("/api/execution-tasks")
@OperationLog(moduleCode = "EXECUTION", moduleName = "执行中心", bizType = "EXECUTION_TASK")
public class ExecutionTaskController {

    private final ExecutionTaskService executionTaskService;

    public ExecutionTaskController(ExecutionTaskService executionTaskService) {
        this.executionTaskService = executionTaskService;
    }

    @GetMapping
    @RequirePermission("task:view")
    public ApiResponse<PageResponse<ExecutionTaskSummary>> page(@RequestParam(defaultValue = "1") int page,
                                                                @RequestParam(defaultValue = "10") int size,
                                                                @RequestParam(required = false) String keyword,
                                                                @RequestParam(required = false) String status,
                                                                @RequestParam(required = false) String scenarioCode,
                                                                @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(executionTaskService.pageExecutionTasks(page, size, keyword, status, scenarioCode, projectId));
    }

    @GetMapping("/stats")
    @RequirePermission("task:view")
    public ApiResponse<ExecutionTaskListStatsSummary> stats(@RequestParam(required = false) String keyword,
                                                            @RequestParam(required = false) String status,
                                                            @RequestParam(required = false) String scenarioCode,
                                                            @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(executionTaskService.getExecutionTaskListStats(keyword, status, scenarioCode, projectId));
    }

    @GetMapping("/{id}")
    @RequirePermission("task:view")
    public ApiResponse<ExecutionTaskDetail> detail(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.getExecutionTask(id));
    }

    @GetMapping("/{id}/runs")
    @RequirePermission("task:view")
    public ApiResponse<List<ExecutionRunSummary>> listRuns(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.listExecutionRuns(id));
    }

    @PostMapping
    @RequirePermission("task:execution:create")
    @OperationLog(actionCode = "EXECUTION_TASK_CREATE", actionName = "创建执行任务", bizIdParam = "id")
    public ApiResponse<ExecutionTaskSummary> create(@Valid @RequestBody CreateExecutionTaskRequest request) {
        return ApiResponse.success(executionTaskService.createExecutionTask(request));
    }

    @PostMapping("/{id}/cancel")
    @RequirePermission("task:execution:cancel")
    @OperationLog(actionCode = "EXECUTION_TASK_CANCEL", actionName = "取消执行任务", bizIdParam = "id")
    public ApiResponse<ExecutionTaskSummary> cancel(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.cancelExecutionTask(id));
    }

    @PostMapping("/{id}/retry")
    @RequirePermission("task:execution:retry")
    @OperationLog(actionCode = "EXECUTION_TASK_RETRY", actionName = "重试执行任务", bizIdParam = "id")
    public ApiResponse<ExecutionTaskSummary> retry(@PathVariable Long id) {
        return ApiResponse.success(executionTaskService.retryExecutionTask(id));
    }

    @PutMapping("/{id}/plan-markdown")
    @RequirePermission("task:view")
    @OperationLog(actionCode = "EXECUTION_TASK_UPDATE_PLAN", actionName = "更新执行规划", bizIdParam = "id")
    public ApiResponse<ExecutionTaskDetail> updatePlanMarkdown(@PathVariable Long id,
                                                               @Valid @RequestBody UpdateExecutionPlanMarkdownRequest request) {
        return ApiResponse.success(executionTaskService.updateExecutionPlanMarkdown(id, request));
    }

    @PostMapping("/{id}/confirm-plan")
    @RequirePermission("task:view")
    @OperationLog(actionCode = "EXECUTION_TASK_CONFIRM_PLAN", actionName = "确认执行规划", bizIdParam = "id")
    public ApiResponse<ExecutionTaskDetail> confirmPlan(@PathVariable Long id,
                                                        @Valid @RequestBody ConfirmExecutionPlanRequest request) {
        return ApiResponse.success(executionTaskService.confirmExecutionPlan(id, request));
    }
}
