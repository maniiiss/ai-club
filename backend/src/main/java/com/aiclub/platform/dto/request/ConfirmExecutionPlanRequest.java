package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * 提交最终版开发执行规划，并继续执行后续步骤。
 */
public record ConfirmExecutionPlanRequest(
        @NotBlank(message = "执行规划不能为空")
        String planMarkdown
) {
}
