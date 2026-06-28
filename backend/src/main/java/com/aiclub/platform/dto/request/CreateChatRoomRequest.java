package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 创建聊天室请求。
 */
public record CreateChatRoomRequest(
        @NotBlank(message = "房间标题不能为空")
        @Size(max = 120, message = "房间标题不能超过120个字符")
        String title,
        Long projectId,
        List<Long> invitedUserIds
) {
    public CreateChatRoomRequest {
        invitedUserIds = invitedUserIds == null ? List.of() : List.copyOf(invitedUserIds);
    }
}
