package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * 更新聊天室显式邀请成员请求。
 * 业务意图：全局房间完全依赖显式成员；项目房间在项目参与人自动可见之外，也允许额外邀请协作者进入聊天室。
 */
public record UpdateChatRoomMembersRequest(
        List<Long> memberUserIds
) {
    public UpdateChatRoomMembersRequest {
        memberUserIds = memberUserIds == null ? List.of() : List.copyOf(memberUserIds);
    }
}
