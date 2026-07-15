package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 用户对单条 GitPilot 助手回答提交的评价。 */
public record AssistantMessageFeedbackRequest(
        /** 评价方向：UP 或 DOWN。 */
        @NotBlank(message = "请选择反馈方向")
        String vote,
        /** 点踩时可选择的原因编码。 */
        @Size(max = 8, message = "反馈原因最多选择8项")
        List<String> reasonCodes,
        /** 用户补充说明。 */
        @Size(max = 2000, message = "补充说明不能超过2000字")
        String comment
) {
}
