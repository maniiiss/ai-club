package com.aiclub.platform.dto;

/**
 * 需求工作项 PRD 投影详情。
 */
public record TaskPrdDetail(
        Long taskId,
        String moduleName,
        String status,
        String statusMessage,
        Long wikiSpaceId,
        String wikiSpaceName,
        Long prdWikiDirectoryId,
        String prdWikiDirectoryName,
        Long prdWikiPageId,
        String prdWikiPageTitle,
        String prdWikiPageContent,
        String prdWikiPageUpdatedAt,
        String lastGeneratedAt,
        String lastAiSuggestedAt,
        String lastUserConfirmedAt
) {
}
