package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.ChatRoomAgentConfigSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskSummary;
import com.aiclub.platform.dto.ChatRoomAgentToolPolicySummary;
import com.aiclub.platform.dto.ChatRoomDetail;
import com.aiclub.platform.dto.ChatRoomSummary;
import com.aiclub.platform.dto.request.CreateChatRoomRequest;
import com.aiclub.platform.dto.request.HermesActionExecutedRequest;
import com.aiclub.platform.dto.request.HermesSelectionRequest;
import com.aiclub.platform.dto.request.SendChatMessageRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentConfigRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentToolPoliciesRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomMembersRequest;
import com.aiclub.platform.service.ChatRoomAgentService;
import com.aiclub.platform.service.ChatRoomService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 公众端多人聊天室控制器。
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatRoomService chatRoomService;
    private final ChatRoomAgentService chatRoomAgentService;

    public ChatController(ChatRoomService chatRoomService, ChatRoomAgentService chatRoomAgentService) {
        this.chatRoomService = chatRoomService;
        this.chatRoomAgentService = chatRoomAgentService;
    }

    @GetMapping("/rooms")
    @RequirePermission("chat:view")
    public ApiResponse<List<ChatRoomSummary>> listRooms() {
        return ApiResponse.success(chatRoomService.listRooms());
    }

    @PostMapping("/rooms")
    @RequirePermission("chat:manage")
    public ApiResponse<ChatRoomSummary> createRoom(@Valid @RequestBody CreateChatRoomRequest request) {
        return ApiResponse.success(chatRoomService.createRoom(request));
    }

    @GetMapping("/rooms/{roomId}")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomDetail> getRoom(@PathVariable Long roomId) {
        return ApiResponse.success(chatRoomService.getRoomDetail(roomId));
    }

    @GetMapping("/rooms/{roomId}/messages")
    @RequirePermission("chat:view")
    public ApiResponse<List<ChatMessageSummary>> listMessages(@PathVariable Long roomId) {
        return ApiResponse.success(chatRoomService.listMessages(roomId));
    }

    @PostMapping(value = "/rooms/{roomId}/messages", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @RequirePermission("chat:view")
    public ApiResponse<ChatMessageSummary> sendMessage(@PathVariable Long roomId,
                                                       @RequestParam("content") String content,
                                                       @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ApiResponse.success(chatRoomService.sendMessage(roomId, new SendChatMessageRequest(content, List.of()), files));
    }

    @PostMapping(value = "/rooms/{roomId}/messages", consumes = MediaType.APPLICATION_JSON_VALUE)
    @RequirePermission("chat:view")
    public ApiResponse<ChatMessageSummary> sendMessageJson(@PathVariable Long roomId,
                                                           @Valid @RequestBody SendChatMessageRequest request) {
        return ApiResponse.success(chatRoomService.sendMessage(roomId, request));
    }

    @PutMapping("/rooms/{roomId}/members")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomSummary> updateMembers(@PathVariable Long roomId,
                                                      @Valid @RequestBody UpdateChatRoomMembersRequest request) {
        return ApiResponse.success(chatRoomService.updateMembers(roomId, request));
    }

    @GetMapping("/rooms/{roomId}/agent")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentConfigSummary> getAgentConfig(@PathVariable Long roomId) {
        return ApiResponse.success(chatRoomAgentService.getConfig(roomId));
    }

    @PutMapping("/rooms/{roomId}/agent")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentConfigSummary> updateAgentConfig(@PathVariable Long roomId,
                                                                     @Valid @RequestBody UpdateChatRoomAgentConfigRequest request) {
        return ApiResponse.success(chatRoomAgentService.updateConfig(roomId, request));
    }

    @GetMapping("/rooms/{roomId}/agent/tools")
    @RequirePermission("chat:view")
    public ApiResponse<List<ChatRoomAgentToolPolicySummary>> listAgentTools(@PathVariable Long roomId) {
        return ApiResponse.success(chatRoomAgentService.listToolPolicies(roomId));
    }

    @PutMapping("/rooms/{roomId}/agent/tools")
    @RequirePermission("chat:view")
    public ApiResponse<List<ChatRoomAgentToolPolicySummary>> updateAgentTools(@PathVariable Long roomId,
                                                                              @Valid @RequestBody UpdateChatRoomAgentToolPoliciesRequest request) {
        return ApiResponse.success(chatRoomAgentService.updateToolPolicies(roomId, request));
    }

    @GetMapping("/rooms/{roomId}/agent/tasks")
    @RequirePermission("chat:view")
    public ApiResponse<List<ChatRoomAgentTaskSummary>> listAgentTasks(@PathVariable Long roomId) {
        return ApiResponse.success(chatRoomAgentService.listTasks(roomId));
    }

    @PostMapping("/rooms/{roomId}/agent/tasks/{taskId}/retry")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentTaskSummary> retryAgentTask(@PathVariable Long roomId, @PathVariable Long taskId) {
        return ApiResponse.success(chatRoomAgentService.retryTask(roomId, taskId));
    }

    @PostMapping("/rooms/{roomId}/agent/tasks/{taskId}/cancel")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentTaskSummary> cancelAgentTask(@PathVariable Long roomId, @PathVariable Long taskId) {
        return ApiResponse.success(chatRoomAgentService.cancelTask(roomId, taskId));
    }

    @PostMapping("/rooms/{roomId}/agent/tasks/{taskId}/actions/executed")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentTaskSummary> markAgentActionExecuted(@PathVariable Long roomId,
                                                                         @PathVariable Long taskId,
                                                                         @Valid @RequestBody HermesActionExecutedRequest request) {
        return ApiResponse.success(chatRoomAgentService.markActionExecuted(roomId, taskId, request));
    }

    @PostMapping("/rooms/{roomId}/agent/tasks/{taskId}/actions/canceled")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentTaskSummary> cancelAgentAction(@PathVariable Long roomId,
                                                                   @PathVariable Long taskId,
                                                                   @Valid @RequestBody HermesActionExecutedRequest request) {
        return ApiResponse.success(chatRoomAgentService.cancelAction(roomId, taskId, request));
    }

    @PostMapping("/rooms/{roomId}/agent/tasks/{taskId}/selections")
    @RequirePermission("chat:view")
    public ApiResponse<ChatRoomAgentTaskSummary> selectAgentCandidate(@PathVariable Long roomId,
                                                                      @PathVariable Long taskId,
                                                                      @Valid @RequestBody HermesSelectionRequest request) {
        return ApiResponse.success(chatRoomAgentService.selectCandidate(roomId, taskId, request));
    }
}
