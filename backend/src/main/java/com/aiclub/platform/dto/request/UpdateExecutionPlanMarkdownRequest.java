package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * 更新开发执行规划 Markdown。
 */
public record UpdateExecutionPlanMarkdownRequest(
        @NotBlank(message = "执行规划不能为空")
        String planMarkdown
) {
}
