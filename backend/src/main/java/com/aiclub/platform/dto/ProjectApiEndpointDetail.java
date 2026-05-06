package com.aiclub.platform.dto;

import java.util.List;

/**
 * API 接口详情，承接文档、编辑和调试的统一加载结果。
 */
public record ProjectApiEndpointDetail(
        Long id,
        Long projectId,
        Long folderId,
        String name,
        String method,
        String path,
        String summary,
        String descriptionMarkdown,
        String requestContentType,
        List<ProjectApiParameterSummary> pathParams,
        List<ProjectApiParameterSummary> queryParams,
        List<ProjectApiParameterSummary> headerParams,
        String bodyExampleText,
        List<ProjectApiResponseExampleSummary> responseExamples,
        ProjectApiDebugConfigSummary debugConfig,
        String createdAt,
        String updatedAt
) {
}
