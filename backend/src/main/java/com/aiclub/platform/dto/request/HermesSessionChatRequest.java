package com.aiclub.platform.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 基于已存在会话发送 Hermes 问答时使用的请求体。
 */
public record HermesSessionChatRequest(
        @NotBlank(message = "问题不能为空")
        @Size(max = 2000, message = "问题长度不能超过 2000 个字符")
        String question,
        /**
         * 当用户从候选卡片中确认对象后，前端会把选择结果一并带回。
         */
        @Valid
        HermesSelectionRequest selection,
        /**
         * 调试模式仅用于前端展示内部规划轨迹，默认关闭。
         */
        Boolean debug
) {
}
