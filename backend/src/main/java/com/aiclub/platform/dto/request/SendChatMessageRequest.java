package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 发送聊天室消息请求。
 */
public record SendChatMessageRequest(
        @Size(max = 20000, message = "消息内容不能超过20000个字符")
        String content,
        List<Long> attachmentAssetIds
) {
    public SendChatMessageRequest {
        attachmentAssetIds = attachmentAssetIds == null ? List.of() : List.copyOf(attachmentAssetIds);
    }
}
