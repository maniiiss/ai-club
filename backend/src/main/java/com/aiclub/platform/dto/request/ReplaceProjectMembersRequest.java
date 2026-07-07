package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * 替换项目成员请求。
 * 业务意图：公众端项目空间只维护协作成员名单，不修改项目名称、负责人、状态等基础资料。
 */
public record ReplaceProjectMembersRequest(
        List<Long> memberUserIds
) {
    public ReplaceProjectMembersRequest {
        memberUserIds = memberUserIds == null ? List.of() : List.copyOf(memberUserIds);
    }
}
