package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AssistantFeedbackDetail;
import com.aiclub.platform.dto.AssistantFeedbackStats;
import com.aiclub.platform.dto.AssistantFeedbackSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AssistantFeedbackQueryRequest;
import com.aiclub.platform.dto.request.AssistantFeedbackResolutionRequest;
import com.aiclub.platform.dto.request.AssistantFeedbackTriageRequest;
import com.aiclub.platform.dto.request.AssistantMessageFeedbackRequest;
import com.aiclub.platform.service.AssistantFeedbackService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * GitPilot 单条回答反馈接口。
 * 业务意图：将用户评价入口与管理端运营队列放在同一领域边界内，避免复用通用反馈而丢失问答上下文。
 */
@RestController
public class AssistantFeedbackController {

    private final AssistantFeedbackService assistantFeedbackService;

    public AssistantFeedbackController(AssistantFeedbackService assistantFeedbackService) {
        this.assistantFeedbackService = assistantFeedbackService;
    }

    /** 用户提交或覆盖一条助手回答评价。 */
    @PostMapping("/api/assistant/sessions/{sessionId}/messages/{messageId}/feedback")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantFeedbackSummary> submit(@PathVariable Long sessionId,
                                                        @PathVariable Long messageId,
                                                        @Valid @RequestBody AssistantMessageFeedbackRequest request) {
        return ApiResponse.success(assistantFeedbackService.submit(sessionId, messageId, request));
    }

    /** 当前用户分页查看自己的 GitPilot 反馈。 */
    @GetMapping("/api/assistant/feedback")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<PageResponse<AssistantFeedbackSummary>> pageMine(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long sessionId) {
        return ApiResponse.success(assistantFeedbackService.pageMine(page, size, sessionId));
    }

    /** 当前用户读取一条反馈及处理结果。 */
    @GetMapping("/api/assistant/feedback/{id}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantFeedbackDetail> getMine(@PathVariable Long id) {
        return ApiResponse.success(assistantFeedbackService.getMine(id));
    }

    /** 管理员分页读取 GitPilot 反馈运营队列。 */
    @GetMapping("/api/assistant-feedback")
    @RequirePermission("system:assistant-feedback:view")
    public ApiResponse<PageResponse<AssistantFeedbackSummary>> pageAdmin(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String vote,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String datasetStatus,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long assigneeUserId) {
        return ApiResponse.success(assistantFeedbackService.pageAdmin(page, size,
                new AssistantFeedbackQueryRequest(keyword, vote, status, datasetStatus, projectId, assigneeUserId)));
    }

    /** 管理员查看反馈详情和处理活动。 */
    @GetMapping("/api/assistant-feedback/{id}")
    @RequirePermission("system:assistant-feedback:view")
    public ApiResponse<AssistantFeedbackDetail> getAdmin(@PathVariable Long id) {
        return ApiResponse.success(assistantFeedbackService.getAdmin(id));
    }

    /** 获取管理端反馈统计。 */
    @GetMapping("/api/assistant-feedback/stats")
    @RequirePermission("system:assistant-feedback:view")
    public ApiResponse<AssistantFeedbackStats> stats() {
        return ApiResponse.success(assistantFeedbackService.stats());
    }

    /** 更新反馈分诊状态与负责人。 */
    @PatchMapping("/api/assistant-feedback/{id}/triage")
    @RequirePermission("system:assistant-feedback:manage")
    @OperationLog(moduleCode = "ASSISTANT_FEEDBACK", moduleName = "GitPilot反馈", actionCode = "TRIAGE", actionName = "反馈分诊", bizType = "ASSISTANT_FEEDBACK", bizIdParam = "id")
    public ApiResponse<AssistantFeedbackDetail> triage(@PathVariable Long id,
                                                       @Valid @RequestBody AssistantFeedbackTriageRequest request) {
        return ApiResponse.success(assistantFeedbackService.triage(id, request));
    }

    /** 更新反馈处理结论和复盘数据集标记。 */
    @PatchMapping("/api/assistant-feedback/{id}/resolution")
    @RequirePermission("system:assistant-feedback:manage")
    @OperationLog(moduleCode = "ASSISTANT_FEEDBACK", moduleName = "GitPilot反馈", actionCode = "RESOLVE", actionName = "反馈结论", bizType = "ASSISTANT_FEEDBACK", bizIdParam = "id")
    public ApiResponse<AssistantFeedbackDetail> resolve(@PathVariable Long id,
                                                        @Valid @RequestBody AssistantFeedbackResolutionRequest request) {
        return ApiResponse.success(assistantFeedbackService.resolve(id, request));
    }

    /** 分页读取已纳入复盘数据集的反馈样本。 */
    @GetMapping("/api/assistant-feedback/dataset")
    @RequirePermission("system:assistant-feedback:view")
    public ApiResponse<PageResponse<AssistantFeedbackSummary>> pageDataset(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.success(assistantFeedbackService.pageDataset(page, size, keyword));
    }
}
