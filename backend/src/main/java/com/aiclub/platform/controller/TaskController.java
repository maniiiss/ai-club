package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ExecutionTaskSummary;
import com.aiclub.platform.dto.BatchTaskOperationItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskPrdAnalyzeResult;
import com.aiclub.platform.dto.TaskPrdDetail;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.TaskCommentSummary;
import com.aiclub.platform.dto.TaskLinksSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.TaskUpdateRecordSummary;
import com.aiclub.platform.dto.request.ApplyTaskPrdSuggestionRequest;
import com.aiclub.platform.dto.request.BatchTaskDeleteRequest;
import com.aiclub.platform.dto.request.BatchTaskUpdateRequest;
import com.aiclub.platform.dto.request.CreateExecutionTaskRequest;
import com.aiclub.platform.dto.request.TaskAgentRunRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskLinkRequest;
import com.aiclub.platform.dto.request.TaskPrdAnalyzeRequest;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.ExecutionTaskService;
import com.aiclub.platform.service.RequirementAiExecutionQueryService;
import com.aiclub.platform.service.TaskAgentRunService;
import com.aiclub.platform.service.TaskPrdService;
import com.aiclub.platform.service.WorkItemLinkService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final PlatformStoreService platformStoreService;
    private final TaskAgentRunService taskAgentRunService;
    private final RequirementAiExecutionQueryService requirementAiExecutionQueryService;
    private final TaskPrdService taskPrdService;
    private final WorkItemLinkService workItemLinkService;
    private final ExecutionTaskService executionTaskService;

    public TaskController(PlatformStoreService platformStoreService,
                          TaskAgentRunService taskAgentRunService,
                          RequirementAiExecutionQueryService requirementAiExecutionQueryService,
                          TaskPrdService taskPrdService,
                          WorkItemLinkService workItemLinkService,
                          ExecutionTaskService executionTaskService) {
        this.platformStoreService = platformStoreService;
        this.taskAgentRunService = taskAgentRunService;
        this.requirementAiExecutionQueryService = requirementAiExecutionQueryService;
        this.taskPrdService = taskPrdService;
        this.workItemLinkService = workItemLinkService;
        this.executionTaskService = executionTaskService;
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

    @GetMapping("/{id}/update-records")
    @RequirePermission("task:view")
    public ApiResponse<PageResponse<TaskUpdateRecordSummary>> updateRecords(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ApiResponse.success(platformStoreService.pageTaskUpdateRecords(id, page, size));
    }

    @GetMapping("/{id}/links")
    @RequirePermission("task:view")
    public ApiResponse<TaskLinksSummary> links(@PathVariable Long id) {
        return ApiResponse.success(workItemLinkService.getLinks(id));
    }

    @PostMapping("/{id}/children")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> addChild(@PathVariable Long id,
                                                  @Valid @RequestBody TaskLinkRequest request) {
        return ApiResponse.success(workItemLinkService.addChild(id, request));
    }

    @DeleteMapping("/{id}/children/{childTaskId}")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> removeChild(@PathVariable Long id,
                                                     @PathVariable Long childTaskId) {
        return ApiResponse.success(workItemLinkService.removeChild(id, childTaskId));
    }

    @PostMapping("/{id}/related-work-items")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> addRelatedWorkItem(@PathVariable Long id,
                                                            @Valid @RequestBody TaskLinkRequest request) {
        return ApiResponse.success(workItemLinkService.addRelatedWorkItem(id, request));
    }

    @DeleteMapping("/{id}/related-work-items/{relatedTaskId}")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> removeRelatedWorkItem(@PathVariable Long id,
                                                               @PathVariable Long relatedTaskId) {
        return ApiResponse.success(workItemLinkService.removeRelatedWorkItem(id, relatedTaskId));
    }

    @PostMapping("/{id}/test-cases")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> addTestCase(@PathVariable Long id,
                                                     @Valid @RequestBody TaskLinkRequest request) {
        return ApiResponse.success(workItemLinkService.addTestCase(id, request));
    }

    @DeleteMapping("/{id}/test-cases/{testCaseId}")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> removeTestCase(@PathVariable Long id,
                                                        @PathVariable Long testCaseId) {
        return ApiResponse.success(workItemLinkService.removeTestCase(id, testCaseId));
    }

    @PostMapping("/{id}/attachments")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary.TaskAttachmentSummary> uploadAttachment(@PathVariable Long id,
                                                                                @RequestParam("file") MultipartFile file) {
        return ApiResponse.success(workItemLinkService.uploadAttachment(id, file));
    }

    @GetMapping("/{id}/attachments/{attachmentId}/download")
    @RequirePermission("task:view")
    public ResponseEntity<byte[]> downloadAttachment(@PathVariable Long id,
                                                     @PathVariable Long attachmentId) {
        return workItemLinkService.downloadAttachment(id, attachmentId);
    }

    @DeleteMapping("/{id}/attachments/{attachmentId}")
    @RequirePermission("task:manage")
    public ApiResponse<TaskLinksSummary> removeAttachment(@PathVariable Long id,
                                                          @PathVariable Long attachmentId) {
        return ApiResponse.success(workItemLinkService.removeAttachment(id, attachmentId));
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
    public ApiResponse<ExecutionTaskSummary> generateRequirementAi(@PathVariable Long id,
                                                                   @Valid @RequestBody TaskRequirementAiRequest request) {
        return ApiResponse.success(requirementAiExecutionQueryService.create(id, request, false));
    }

    /**
     * 管理端技术设计执行入口不扣公众积分，但复用同一领域校验和专用编排。
     */
    @PostMapping("/{id}/technical-design-executions")
    @RequirePermission("task:execution:create")
    public ApiResponse<ExecutionTaskSummary> createTechnicalDesignExecution(
            @PathVariable Long id,
            @Valid @RequestBody CreateExecutionTaskRequest request) {
        return ApiResponse.success(executionTaskService.createTechnicalDesignExecution(id, request));
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

    /**
     * 公众端规划页批量字段更新入口。
     * 单次 HTTP 请求返回逐项结果；每项继续复用既有工作项校验和更新事务，允许部分成功。
     */
    @PutMapping("/batch")
    @RequirePermission("task:manage")
    public ApiResponse<List<BatchTaskOperationItem>> batchUpdate(@Valid @RequestBody BatchTaskUpdateRequest request) {
        List<BatchTaskOperationItem> results = new ArrayList<>();
        for (Long taskId : new LinkedHashSet<>(request.taskIds())) {
            try {
                results.add(new BatchTaskOperationItem(
                        taskId,
                        platformStoreService.updateTaskBatchField(taskId, request),
                        null
                ));
            } catch (RuntimeException exception) {
                results.add(new BatchTaskOperationItem(taskId, null, failureMessage(exception)));
            }
        }
        return ApiResponse.success(results);
    }


    @DeleteMapping("/{id}")
    @RequirePermission("task:manage")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        platformStoreService.deleteTask(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    /** 批量删除入口，服务端逐项执行权限校验并返回部分成功结果。 */
    @DeleteMapping("/batch")
    @RequirePermission("task:manage")
    public ApiResponse<List<BatchTaskOperationItem>> batchDelete(@Valid @RequestBody BatchTaskDeleteRequest request) {
        List<BatchTaskOperationItem> results = new ArrayList<>();
        for (Long taskId : new LinkedHashSet<>(request.taskIds())) {
            try {
                platformStoreService.deleteTask(taskId);
                results.add(new BatchTaskOperationItem(taskId, null, null));
            } catch (RuntimeException exception) {
                results.add(new BatchTaskOperationItem(taskId, null, failureMessage(exception)));
            }
        }
        return ApiResponse.success(results);
    }

    private String failureMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "操作失败" : message;
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
