package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskAgentRunSummary;
import com.aiclub.platform.dto.TaskCommentSummary;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.UploadedFileSummary;
import com.aiclub.platform.dto.request.TaskAgentRunRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.service.PlatformStoreService;
import com.aiclub.platform.service.TaskCommentImageStorageService;
import com.aiclub.platform.service.TaskRequirementAiService;
import com.aiclub.platform.service.TaskAgentRunService;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final PlatformStoreService platformStoreService;
    private final TaskAgentRunService taskAgentRunService;
    private final TaskCommentImageStorageService taskCommentImageStorageService;
    private final TaskRequirementAiService taskRequirementAiService;

    public TaskController(PlatformStoreService platformStoreService,
                          TaskAgentRunService taskAgentRunService,
                          TaskCommentImageStorageService taskCommentImageStorageService,
                          TaskRequirementAiService taskRequirementAiService) {
        this.platformStoreService = platformStoreService;
        this.taskAgentRunService = taskAgentRunService;
        this.taskCommentImageStorageService = taskCommentImageStorageService;
        this.taskRequirementAiService = taskRequirementAiService;
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

    @PostMapping("/{id}/comment-images")
    @RequirePermission("task:view")
    public ApiResponse<UploadedFileSummary> uploadCommentImage(@PathVariable Long id,
                                                               @RequestParam("file") MultipartFile file) {
        platformStoreService.getTask(id);
        return ApiResponse.success(storeUploadedFile(file));
    }

    @PostMapping("/images")
    @RequirePermission("task:view")
    public ApiResponse<UploadedFileSummary> uploadImage(@RequestParam("file") MultipartFile file) {
        return ApiResponse.success(storeUploadedFile(file));
    }

    @PostMapping("/{id}/requirement-ai")
    @RequirePermission("task:view")
    public ApiResponse<TaskRequirementAiResult> generateRequirementAi(@PathVariable Long id,
                                                                      @Valid @RequestBody TaskRequirementAiRequest request) {
        return ApiResponse.success(taskRequirementAiService.generate(id, request));
    }

    private UploadedFileSummary storeUploadedFile(MultipartFile file) {
        TaskCommentImageStorageService.StoredCommentImage stored = taskCommentImageStorageService.store(file);
        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/comment-images")
                .queryParam("key", stored.objectKey())
                .toUriString();
        return new UploadedFileSummary(url, stored.fileName(), stored.size());
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

    @PostMapping("/{id}/requirement-dev-pass")
    @RequirePermission("task:requirement:dev")
    public ApiResponse<TaskSummary> passRequirementDev(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.passRequirementDev(id));
    }

    @PostMapping("/{id}/requirement-test-pass")
    @RequirePermission("task:requirement:test")
    public ApiResponse<TaskSummary> passRequirementTest(@PathVariable Long id) {
        return ApiResponse.success(platformStoreService.passRequirementTest(id));
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
    public ApiResponse<TaskAgentRunSummary> runAgent(@PathVariable Long id,
                                                     @Valid @RequestBody TaskAgentRunRequest request) {
        return ApiResponse.success(taskAgentRunService.runTaskAgent(id, request.input()));
    }
}
