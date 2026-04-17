package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;

import java.util.List;

/**
 * 整体替换 Wiki 空间成员列表请求。
 */
public record ReplaceWikiSpaceMembersRequest(
        @Valid
        List<WikiSpaceMemberItemRequest> members
) {
}
