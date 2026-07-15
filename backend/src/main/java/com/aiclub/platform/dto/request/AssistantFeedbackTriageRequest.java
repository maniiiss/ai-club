package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 管理员分诊 GitPilot 反馈的请求。 */
public record AssistantFeedbackTriageRequest(
        /** 目标状态。 */
        @NotBlank(message = "请选择处理状态")
        String status,
        /** 负责人用户 ID，可为空表示取消分配。 */
        Long assigneeUserId,
        /** 分诊备注。 */
        @Size(max = 2000, message = "分诊备注不能超过2000字")
        String note
) {
}
