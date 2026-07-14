package com.aiclub.platform.dto;

/**
 * Assistant 会话详情中的单条消息回显项。
 */
public record AssistantConversationMessageItem(
        Long id,
        String role,
        String content,
        String status,
        String createdAt,
        java.util.List<AssistantAttachmentSummary> attachments
) {
    public AssistantConversationMessageItem {
        attachments = attachments == null ? java.util.List.of() : java.util.List.copyOf(attachments);
    }
}
