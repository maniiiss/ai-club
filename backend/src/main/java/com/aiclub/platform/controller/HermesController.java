package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.HermesChatResponse;
import com.aiclub.platform.dto.HermesConversationDetail;
import com.aiclub.platform.dto.HermesConversationSessionSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateHermesConversationSessionRequest;
import com.aiclub.platform.dto.request.HermesMultipartChatCommand;
import com.aiclub.platform.dto.request.HermesSessionChatRequest;
import com.aiclub.platform.dto.request.HermesSelectionFormRequest;
import com.aiclub.platform.dto.request.RenameHermesConversationSessionRequest;
import com.aiclub.platform.service.DocumentAssetService;
import com.aiclub.platform.service.HermesAttachmentService;
import com.aiclub.platform.service.HermesChatService;
import com.aiclub.platform.service.HermesConversationSessionService;
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
 * Hermes 平台内置助手的专用控制器。
 */
@RestController
@RequestMapping("/api/hermes")
@OperationLog(skip = true)
public class HermesController {

    private final HermesChatService hermesChatService;
    private final HermesConversationSessionService hermesConversationSessionService;
    private final HermesAttachmentService hermesAttachmentService;
    private final DocumentAssetService documentAssetService;
    private final ObjectMapper objectMapper;

    @Autowired
    public HermesController(HermesChatService hermesChatService,
                            HermesConversationSessionService hermesConversationSessionService,
                            HermesAttachmentService hermesAttachmentService,
                            DocumentAssetService documentAssetService,
                            ObjectMapper objectMapper) {
        this.hermesChatService = hermesChatService;
        this.hermesConversationSessionService = hermesConversationSessionService;
        this.hermesAttachmentService = hermesAttachmentService;
        this.documentAssetService = documentAssetService;
        this.objectMapper = objectMapper;
    }

    /**
     * 创建一条绑定当前页面上下文的 Hermes 会话。
     */
    @PostMapping("/sessions")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationSessionSummary> createSession(
            @Valid @RequestBody CreateHermesConversationSessionRequest request) {
        return ApiResponse.success(hermesConversationSessionService.createSession(request));
    }

    /**
     * 分页读取当前用户的 Hermes 会话列表。
     */
    @GetMapping("/sessions")
    @RequirePermission("hermes:chat")
    public ApiResponse<PageResponse<HermesConversationSessionSummary>> pageSessions(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean archived) {
        return ApiResponse.success(hermesConversationSessionService.pageSessions(page, size, archived));
    }

    /**
     * 读取指定会话的详情和历史消息。
     */
    @GetMapping("/sessions/{sessionId}")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationDetail> getSessionDetail(@PathVariable Long sessionId) {
        return ApiResponse.success(hermesConversationSessionService.getSessionDetail(sessionId));
    }

    /**
     * 重命名指定会话。
     */
    @PatchMapping("/sessions/{sessionId}")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationSessionSummary> renameSession(@PathVariable Long sessionId,
                                                                       @Valid @RequestBody RenameHermesConversationSessionRequest request) {
        return ApiResponse.success(hermesConversationSessionService.renameSession(sessionId, request));
    }

    /**
     * 为兼容部分代理或环境不支持 PATCH 的情况，额外开放 PUT 重命名入口。
     */
    @PutMapping("/sessions/{sessionId}")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationSessionSummary> renameSessionByPut(@PathVariable Long sessionId,
                                                                            @Valid @RequestBody RenameHermesConversationSessionRequest request) {
        return ApiResponse.success(hermesConversationSessionService.renameSession(sessionId, request));
    }

    /**
     * 归档指定会话。
     */
    @PostMapping("/sessions/{sessionId}/archive")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationSessionSummary> archiveSession(@PathVariable Long sessionId) {
        return ApiResponse.success(hermesConversationSessionService.archiveSession(sessionId));
    }

    /**
     * 恢复指定会话。
     */
    @PostMapping("/sessions/{sessionId}/restore")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesConversationSessionSummary> restoreSession(@PathVariable Long sessionId) {
        return ApiResponse.success(hermesConversationSessionService.restoreSession(sessionId));
    }

    /**
     * 删除指定会话及其历史消息。
     */
    @DeleteMapping("/sessions/{sessionId}")
    @RequirePermission("hermes:chat")
    public ApiResponse<Void> deleteSession(@PathVariable Long sessionId) {
        hermesConversationSessionService.deleteSession(sessionId);
        return new ApiResponse<>(true, "ok", null);
    }

    /**
     * 指定会话的稳定非流式问答入口。
     */
    @PostMapping("/sessions/{sessionId}/chat")
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesChatResponse> chat(@PathVariable Long sessionId,
                                                @Valid @RequestBody HermesSessionChatRequest request) {
        return ApiResponse.success(hermesChatService.chat(sessionId, request));
    }

    /**
     * 指定会话的带附件非流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission("hermes:chat")
    public ApiResponse<HermesChatResponse> chatWithFiles(@PathVariable Long sessionId,
                                                         @RequestParam("question") String question,
                                                         @RequestParam(value = "selectionJson", required = false) String selectionJson,
                                                         @RequestParam(value = "debug", required = false) Boolean debug,
                                                         @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ApiResponse.success(hermesChatService.chat(sessionId, buildMultipartCommand(question, selectionJson, debug, files)));
    }

    /**
     * 指定会话的统一流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission("hermes:chat")
    public ResponseEntity<StreamingResponseBody> streamChat(@PathVariable Long sessionId,
                                                            @Valid @RequestBody HermesSessionChatRequest request) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(hermesChatService.streamChat(sessionId, request));
    }

    /**
     * 指定会话的带附件流式问答入口。
     */
    @PostMapping(value = "/sessions/{sessionId}/chat/stream", consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @RequirePermission("hermes:chat")
    public ResponseEntity<StreamingResponseBody> streamChatWithFiles(@PathVariable Long sessionId,
                                                                     @RequestParam("question") String question,
                                                                     @RequestParam(value = "selectionJson", required = false) String selectionJson,
                                                                     @RequestParam(value = "debug", required = false) Boolean debug,
                                                                     @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(hermesChatService.streamChat(sessionId, buildMultipartCommand(question, selectionJson, debug, files)));
    }

    /**
     * 将 multipart 表单参数组装成统一的内部聊天命令。
     */
    private HermesMultipartChatCommand buildMultipartCommand(String question,
                                                             String selectionJson,
                                                             Boolean debug,
                                                             List<MultipartFile> files) {
        return new HermesMultipartChatCommand(
                question == null ? "" : question.trim(),
                parseSelection(selectionJson),
                debug,
                files
        );
    }

    private com.aiclub.platform.dto.request.HermesSelectionRequest parseSelection(String selectionJson) {
        if (selectionJson == null || selectionJson.isBlank()) {
            return null;
        }
        try {
            HermesSelectionFormRequest form = objectMapper.readValue(selectionJson, HermesSelectionFormRequest.class);
            return new com.aiclub.platform.dto.request.HermesSelectionRequest(
                    form.slot(),
                    form.entityType(),
                    form.entityId(),
                    form.resumeQuestion()
            );
        } catch (Exception exception) {
            throw new IllegalArgumentException("Hermes 选择信息格式不正确");
        }
    }
}
