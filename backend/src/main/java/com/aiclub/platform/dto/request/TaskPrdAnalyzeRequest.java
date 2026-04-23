package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * PRD 分析请求。
 */
public record TaskPrdAnalyzeRequest(
        @NotBlank(message = "PRD 分析动作不能为空")
        String action,
        Long modelConfigId
) {
}
