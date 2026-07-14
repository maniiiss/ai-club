package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantChatResponse;
import com.aiclub.platform.dto.AssistantConversationDetail;
import com.aiclub.platform.dto.AssistantConversationSessionSummary;
import com.aiclub.platform.dto.AssistantMemoryConsolidationStatus;
import com.aiclub.platform.dto.AssistantMemoryOverview;
import com.aiclub.platform.dto.AssistantMemoryConsolidationTask;
import com.aiclub.platform.dto.AssistantUserMemoryItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateAssistantConversationSessionRequest;
import com.aiclub.platform.dto.request.AssistantActionExecutedRequest;
import com.aiclub.platform.dto.request.AssistantMultipartChatCommand;
import com.aiclub.platform.dto.request.AssistantSessionChatRequest;
import com.aiclub.platform.dto.request.AssistantSelectionFormRequest;
import com.aiclub.platform.dto.request.RenameAssistantConversationSessionRequest;
import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.DocumentAssetService;
import com.aiclub.platform.service.AssistantAttachmentService;
import com.aiclub.platform.service.AssistantChatService;
import com.aiclub.platform.service.AssistantConversationSessionService;
import com.aiclub.platform.service.AssistantHindsightMemoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.util.List;

/**
 * GitPilot 助手控制器。
 * /api/assistant 是 Assistant 对外唯一入口，统一承载会话、记忆和动作协议。
 */
@RestController
@RequestMapping("/api/assistant")
@OperationLog(skip = true)
public class AssistantController {

    private final AssistantChatService assistantChatService;
    private final AssistantConversationSessionService assistantConversationSessionService;
    private final AssistantAttachmentService assistantAttachmentService;
    private final AssistantHindsightMemoryService assistantHindsightMemoryService;
    private final AuthService authService;
    private final DocumentAssetService documentAssetService;
    private final ObjectMapper objectMapper;

    @Autowired
    public AssistantController(AssistantChatService assistantChatService,
                            AssistantConversationSessionService assistantConversationSessionService,
                            AssistantAttachmentService assistantAttachmentService,
                            AssistantHindsightMemoryService assistantHindsightMemoryService,
                            AuthService authService,
                            DocumentAssetService documentAssetService,
                            ObjectMapper objectMapper) {
        this.assistantChatService = assistantChatService;
        this.assistantConversationSessionService = assistantConversationSessionService;
        this.assistantAttachmentService = assistantAttachmentService;
        this.assistantHindsightMemoryService = assistantHindsightMemoryService;
        this.authService = authService;
        this.documentAssetService = documentAssetService;
        this.objectMapper = objectMapper;
    }

    /**
     * 创建一条绑定当前页面上下文的 Assistant 会话。
     */
    @PostMapping("/sessions")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationSessionSummary> createSession(
            @Valid @RequestBody CreateAssistantConversationSessionRequest request) {
        return ApiResponse.success(assistantConversationSessionService.createSession(request));
    }

    /**
     * 分页读取当前用户的 Assistant 会话列表。
     */
    @GetMapping("/sessions")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<PageResponse<AssistantConversationSessionSummary>> pageSessions(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean archived,
            @RequestParam(defaultValue = "ALL") String scope,
            @RequestParam(required = false) Long projectId) {
        return ApiResponse.success(assistantConversationSessionService.pageSessions(page, size, archived, scope, projectId));
    }

    /**
     * 读取指定会话的详情和历史消息。
     */
    @GetMapping("/sessions/{sessionId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationDetail> getSessionDetail(@PathVariable Long sessionId) {
        return ApiResponse.success(assistantConversationSessionService.getSessionDetail(sessionId));
    }

    /**
     * 重命名指定会话。
     */
    @PatchMapping("/sessions/{sessionId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationSessionSummary> renameSession(@PathVariable Long sessionId,
                                                                       @Valid @RequestBody RenameAssistantConversationSessionRequest request) {
        return ApiResponse.success(assistantConversationSessionService.renameSession(sessionId, request));
    }

    /**
     * 为兼容部分代理或环境不支持 PATCH 的情况，额外开放 PUT 重命名入口。
     */
    @PutMapping("/sessions/{sessionId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationSessionSummary> renameSessionByPut(@PathVariable Long sessionId,
                                                                            @Valid @RequestBody RenameAssistantConversationSessionRequest request) {
        return ApiResponse.success(assistantConversationSessionService.renameSession(sessionId, request));
    }

    /**
     * 归档指定会话。
     */
    @PostMapping("/sessions/{sessionId}/archive")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationSessionSummary> archiveSession(@PathVariable Long sessionId) {
        return ApiResponse.success(assistantConversationSessionService.archiveSession(sessionId));
    }

    /**
     * 恢复指定会话。
     */
    @PostMapping("/sessions/{sessionId}/restore")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationSessionSummary> restoreSession(@PathVariable Long sessionId) {
        return ApiResponse.success(assistantConversationSessionService.restoreSession(sessionId));
    }

    /**
     * 删除指定会话及其历史消息。
     */
    @DeleteMapping("/sessions/{sessionId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<Void> deleteSession(@PathVariable Long sessionId) {
        assistantConversationSessionService.deleteSession(sessionId);
        return new ApiResponse<>(true, "ok", null);
    }

    /**
     * 上报某条 Assistant 可执行动作已被用户确认执行。
     * 后端会按会话累积保存动作 key，刷新或换设备后仍能恢复"已执行"状态。
     */
    @PostMapping("/sessions/{sessionId}/actions/executed")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantConversationDetail> markActionExecuted(@PathVariable Long sessionId,
                                                                    @Valid @RequestBody AssistantActionExecutedRequest request) {
        return ApiResponse.success(assistantConversationSessionService.markActionExecuted(sessionId, request.actionKey()));
    }

    /**
     * 指定会话的稳定非流式问答入口。
     */
    @PostMapping("/sessions/{sessionId}/chat")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantChatResponse> chat(@PathVariable Long sessionId,
                                                @Valid @RequestBody AssistantSessionChatRequest request) {
        return ApiResponse.success(assistantChatService.chat(sessionId, request));
    }

    /**
     * 指定会话的带附件非流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantChatResponse> chatWithFiles(@PathVariable Long sessionId,
                                                         @RequestParam("question") String question,
                                                         @RequestParam(value = "selectionJson", required = false) String selectionJson,
                                                         @RequestParam(value = "debug", required = false) Boolean debug,
                                                         @RequestParam(value = "slashCommand", required = false) String slashCommand,
                                                         @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ApiResponse.success(assistantChatService.chat(sessionId, buildMultipartCommand(question, selectionJson, debug, slashCommand, files)));
    }

    /**
     * 指定会话的统一流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ResponseEntity<StreamingResponseBody> streamChat(@PathVariable Long sessionId,
                                                            @Valid @RequestBody AssistantSessionChatRequest request) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(assistantChatService.streamChat(sessionId, request));
    }

    /**
     * 指定会话的带附件流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat/stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ResponseEntity<StreamingResponseBody> streamChatWithFiles(@PathVariable Long sessionId,
                                                                     @RequestParam("question") String question,
                                                                     @RequestParam(value = "selectionJson", required = false) String selectionJson,
                                                                     @RequestParam(value = "debug", required = false) Boolean debug,
                                                                     @RequestParam(value = "slashCommand", required = false) String slashCommand,
                                                                     @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(assistantChatService.streamChat(sessionId, buildMultipartCommand(question, selectionJson, debug, slashCommand, files)));
    }

    /**
     * 将 multipart 表单参数组装成统一的内部聊天命令。
     */
    private AssistantMultipartChatCommand buildMultipartCommand(String question,
                                                             String selectionJson,
                                                             Boolean debug,
                                                             String slashCommand,
                                                             List<MultipartFile> files) {
        return new AssistantMultipartChatCommand(
                question == null ? "" : question.trim(),
                parseSelection(selectionJson),
                debug,
                slashCommand,
                files
        );
    }

    private com.aiclub.platform.dto.request.AssistantSelectionRequest parseSelection(String selectionJson) {
        if (selectionJson == null || selectionJson.isBlank()) {
            return null;
        }
        try {
            AssistantSelectionFormRequest form = objectMapper.readValue(selectionJson, AssistantSelectionFormRequest.class);
            return new com.aiclub.platform.dto.request.AssistantSelectionRequest(
                    form.slot(),
                    form.entityType(),
                    form.entityId(),
                    form.resumeQuestion()
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitPilot 选择信息格式不正确");
        }
    }

    /**
     * 列出当前用户的 Assistant 记忆。
     */
    @GetMapping("/memories")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMemoryOverview> listMemories(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "50") int limit) {
        CurrentUserInfo currentUser = authService.currentUser();
        return ApiResponse.success(assistantHindsightMemoryService.getUserMemoryOverview(currentUser, query, limit));
    }

    /**
     * 删除当前用户的一条 Assistant 记忆。
     */
    @DeleteMapping("/memories/{documentId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<Void> deleteMemory(@PathVariable String documentId) {
        CurrentUserInfo currentUser = authService.currentUser();
        assistantHindsightMemoryService.deleteUserMemory(currentUser, documentId);
        return new ApiResponse<>(true, "ok", null);
    }

    /**
     * 清空当前用户的全部 Assistant 记忆。
     */
    @DeleteMapping("/memories")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<Integer> clearMemories() {
        CurrentUserInfo currentUser = authService.currentUser();
        int deletedCount = assistantHindsightMemoryService.clearUserMemories(currentUser);
        return ApiResponse.success(deletedCount);
    }

    /**
     * 触发当前用户 Assistant 记忆的整合。
     * Hindsight 这里会返回异步 operation，前端需继续轮询状态而不是直接视为已完成。
     */
    @PostMapping("/memories/consolidate")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMemoryConsolidationTask> consolidateMemories() {
        CurrentUserInfo currentUser = authService.currentUser();
        return ApiResponse.success(assistantHindsightMemoryService.startUserMemoryConsolidation(currentUser));
    }

    /**
     * 查询当前用户某次 Assistant 记忆整理任务的执行状态。
     */
    @GetMapping("/memories/consolidate/{operationId}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMemoryConsolidationStatus> getMemoryConsolidationStatus(@PathVariable String operationId) {
        CurrentUserInfo currentUser = authService.currentUser();
        return ApiResponse.success(assistantHindsightMemoryService.getUserMemoryConsolidationStatus(currentUser, operationId));
    }
}
