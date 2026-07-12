package com.aiclub.platform.dto;

/**
 * 需求 AI 结果中的图片元数据，assetId 是持久化真源，renderUrl 仅用于当前结果展示。
 */
public record RequirementAiResultImage(
        Long assetId,
        String mediaType,
        String altText,
        String sourceName,
        int order,
        String section,
        String renderUrl
) {
}
