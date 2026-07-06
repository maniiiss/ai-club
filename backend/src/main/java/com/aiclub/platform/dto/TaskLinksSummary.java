package com.aiclub.platform.dto;

import java.util.List;

public record TaskLinksSummary(
        List<TaskSummary> children,
        List<TaskSummary> parentWorkItems,
        List<TaskSummary> relatedWorkItems,
        List<LinkedTestCaseSummary> testCases,
        List<TaskAttachmentSummary> attachments
) {
    public record LinkedTestCaseSummary(
            Long id,
            String title,
            String moduleName,
            String caseType,
            String priority,
            Long testPlanId,
            String testPlanName,
            Long projectId,
            String projectName
    ) {
    }

    public record TaskAttachmentSummary(
            Long id,
            Long assetId,
            String fileName,
            String contentType,
            long fileSize,
            String sourceFormat,
            Long uploaderUserId,
            String uploaderName,
            String createdAt
    ) {
    }
}
