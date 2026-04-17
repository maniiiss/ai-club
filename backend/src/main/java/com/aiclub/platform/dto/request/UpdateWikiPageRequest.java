package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 更新 Wiki 页面请求。
 */
public record UpdateWikiPageRequest(
        @NotBlank(message = "Wiki 标题不能为空")
        @Size(max = 200, message = "Wiki 标题长度不能超过200")
        String title,
        @Size(max = 200000, message = "Wiki 内容长度不能超过200000")
        String content,
        Long parentPageId,
        @Size(max = 500, message = "版本说明长度不能超过500")
        String changeSummary,
        @Size(max = 30, message = "可见范围长度不能超过30")
        String visibilityScope,
        List<Long> specificViewerUserIds,
        List<Long> specificEditorUserIds
) {
}
