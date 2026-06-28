package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.ChatMessageSummary;
import com.aiclub.platform.dto.ChatRoomDetail;
import com.aiclub.platform.dto.ChatRoomSummary;
import com.aiclub.platform.dto.request.CreateChatRoomRequest;
import com.aiclub.platform.dto.request.SendChatMessageRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomMembersRequest;
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

    public ChatController(ChatRoomService chatRoomService) {
        this.chatRoomService = chatRoomService;
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
}
