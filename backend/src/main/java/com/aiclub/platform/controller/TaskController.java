package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskPrdAnalyzeResult;
import com.aiclub.platform.dto.TaskPrdDetail;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.TaskCommentSummary;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.ApplyTaskPrdSuggestionRequest;
import com.aiclub.platform.dto.request.TaskAgentRunRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskPrdAnalyzeRequest;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.TaskRequirementAiService;
import com.aiclub.platform.service.TaskAgentRunService;
import com.aiclub.platform.service.TaskPrdService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final PlatformStoreService platformStoreService;
    private final TaskAgentRunService taskAgentRunService;
    private final TaskRequirementAiService taskRequirementAiService;
    private final TaskPrdService taskPrdService;

    public TaskController(PlatformStoreService platformStoreService,
                          TaskAgentRunService taskAgentRunService,
                          TaskRequirementAiService taskRequirementAiService,
                          TaskPrdService taskPrdService) {
        this.platformStoreService = platformStoreService;
        this.taskAgentRunService = taskAgentRunService;
        this.taskRequirementAiService = taskRequirementAiService;
        this.taskPrdService = taskPrdService;
    }

    @GetMapping
    @RequirePermission("task:view")
    public ApiResponse<PageResponse<TaskSummary>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long agentId
    ) {
        return ApiResponse.success(platformStoreService.pageTasks(page, size, keyword, status, priority, projectId, agentId));
    }

    @GetMapping("/{id}")
    @RequirePermission("task:view")
    public ApiResponse<TaskSummary> detail(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.getTask(id));
    }

    @GetMapping("/{id}/prd")
    @RequirePermission("task:view")
    public ApiResponse<TaskPrdDetail> prdDetail(@PathVariable Long id) {
        return ApiResponse.success(taskPrdService.getTaskPrd(id));
    }

    @PostMapping("/{id}/prd/initialize")
    @RequirePermission("task:manage")
    public ApiResponse<TaskPrdDetail> initializePrd(@PathVariable Long id) {
        return ApiResponse.success(taskPrdService.initialize(id));
    }

    @PostMapping("/{id}/prd/analyze")
    @RequirePermission("task:view")
    public ApiResponse<TaskPrdAnalyzeResult> analyzePrd(@PathVariable Long id,
                                                        @Valid @RequestBody TaskPrdAnalyzeRequest request) {
        return ApiResponse.success(taskPrdService.analyze(id, request));
    }

    @PostMapping("/{id}/prd/apply-suggestion")
    @RequirePermission("task:manage")
    public ApiResponse<TaskPrdDetail> applyPrdSuggestion(@PathVariable Long id,
                                                         @Valid @RequestBody ApplyTaskPrdSuggestionRequest request) {
        return ApiResponse.success(taskPrdService.applySuggestion(id, request));
    }

    @GetMapping("/{id}/comments")
    @RequirePermission("task:view")
    public ApiResponse<List<TaskCommentSummary>> listComments(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.listTaskComments(id));
    }

    @PostMapping("/{id}/comments")
    @RequirePermission("task:view")
    public ApiResponse<TaskCommentSummary> createComment(@PathVariable Long id,
                                                         @Valid @RequestBody TaskCommentRequest request) {
        return ApiResponse.success(platformStoreService.createTaskComment(id, request));
    }

    @PostMapping("/{id}/requirement-ai")
    @RequirePermission("task:view")
    public ApiResponse<TaskRequirementAiResult> generateRequirementAi(@PathVariable Long id,
                                                                      @Valid @RequestBody TaskRequirementAiRequest request) {
        return ApiResponse.success(taskRequirementAiService.generate(id, request));
    }

    @PostMapping
    @RequirePermission("task:manage")
    public ApiResponse<TaskSummary> create(@Valid @RequestBody TaskRequest request) {
        return ApiResponse.success(platformStoreService.createTask(request));
    }

    @PutMapping("/{id}")
    @RequirePermission("task:manage")
    public ApiResponse<TaskSummary> update(@PathVariable Long id, @Valid @RequestBody TaskRequest request) {
        return ApiResponse.success(platformStoreService.updateTask(id, request));
    }


    @DeleteMapping("/{id}")
    @RequirePermission("task:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        platformStoreService.deleteTask(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/{id}/agent-runs")
    @RequirePermission("task:view")
    public ApiResponse<List<TaskAgentRunSummary>> listAgentRuns(@PathVariable Long id) {
        return ApiResponse.success(taskAgentRunService.listRecentRuns(id));
    }

    @PostMapping("/{id}/agent-runs")
    @RequirePermission("task:manage")
    public ApiResponse<ExecutionTaskSummary> runAgent(@PathVariable Long id,
                                                      @Valid @RequestBody TaskAgentRunRequest request) {
        return ApiResponse.success(taskAgentRunService.runTaskAgent(id, request.input()));
    }
}
