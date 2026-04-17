package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Wiki 空间成员项请求。
 */
public record WikiSpaceMemberItemRequest(
        @NotNull(message = "成员用户不能为空")
        Long userId,
        @Size(max = 20, message = "成员角色长度不能超过20")
        String memberRole
) {
}
