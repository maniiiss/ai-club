package com.aiclub.platform.runtime;

import com.aiclub.platform.dto.AssistantConversationTurn;

import java.util.List;

/**
 * AgentRuntime 通用的历史对话消息。
 * 业务意图：业务层只传递稳定的角色和文本，不向 Runtime 泄漏某个 SDK 的原生消息结构。
 */
public record RuntimeConversationMessage(
        String role,
        String content
) {
    /**
     * 统一清洗聊天角色和正文，保证所有 HTTP Runtime 收到相同的最小历史协议。
     */
    public RuntimeConversationMessage {
        role = "assistant".equalsIgnoreCase(role) ? "assistant" : "user";
        content = content == null ? "" : content;
    }

    /**
     * 将 Assistant 会话的存储消息转换为 AgentRuntime 无关的历史消息。
     */
    public static List<RuntimeConversationMessage> fromAssistantTurns(List<AssistantConversationTurn> turns) {
        if (turns == null || turns.isEmpty()) {
            return List.of();
        }
        return turns.stream()
                .filter(turn -> turn != null)
                .map(turn -> new RuntimeConversationMessage(turn.role(), turn.content()))
                .toList();
    }
}
