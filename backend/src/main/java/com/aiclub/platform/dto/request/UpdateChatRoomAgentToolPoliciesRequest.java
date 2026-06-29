package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * 批量更新聊天室 Agent 工具授权请求。
 */
public record UpdateChatRoomAgentToolPoliciesRequest(
        List<ToolPolicyItem> tools
) {
    public UpdateChatRoomAgentToolPoliciesRequest {
        tools = tools == null ? List.of() : List.copyOf(tools);
    }

    public record ToolPolicyItem(
            String toolCode,
            Boolean enabled,
            Boolean autoExecute
    ) {
    }
}
