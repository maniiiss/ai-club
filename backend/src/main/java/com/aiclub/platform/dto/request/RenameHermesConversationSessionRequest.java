package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 重命名 Hermes 会话时使用的请求体。
 */
public record RenameHermesConversationSessionRequest(
        @NotBlank(message = "会话标题不能为空")
        @Size(max = 100, message = "会话标题长度不能超过 100 个字符")
        String title
) {
}
