package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 前端在歧义候选中完成一次对象选择后提交的确认载荷。
 */
public record HermesSelectionRequest(
        @NotBlank(message = "选择槽位不能为空")
        @Size(max = 40, message = "选择槽位长度不能超过 40 个字符")
        String slot,
        @NotBlank(message = "选择对象类型不能为空")
        @Size(max = 40, message = "选择对象类型长度不能超过 40 个字符")
        String entityType,
        @NotNull(message = "选择对象 ID 不能为空")
        Long entityId,
        @Size(max = 2000, message = "恢复问题长度不能超过 2000 个字符")
        String resumeQuestion
) {
}
