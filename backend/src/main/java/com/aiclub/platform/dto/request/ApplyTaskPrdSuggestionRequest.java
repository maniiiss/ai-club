package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 将 AI 建议稿写入 PRD 页面的请求。
 */
public record ApplyTaskPrdSuggestionRequest(
        @NotBlank(message = "建议稿内容不能为空")
        @Size(max = 200000, message = "建议稿长度不能超过200000")
        String suggestionMarkdown,
        @Size(max = 500, message = "变更说明长度不能超过500")
        String changeSummary
) {
}
