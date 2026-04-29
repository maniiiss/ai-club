package com.aiclub.platform.dto;

import java.util.List;

public record TestPlanSummary(
        Long id,
        String name,
        String status,
        String description,
        Long projectId,
        String projectName,
        Long iterationId,
        String iterationName,
        Integer caseCount,
        Long automationBindingId,
        String automationTargetBranch,
        Integer automationEnabledCaseCount,
        String lastAutomationStatus,
        Long lastAutomationTaskId,
        Long lastAutomationRunId,
        String lastAutomationSummary,
        String lastAutomationAt,
        String lastAutomationMrUrl,
        String createdAt,
        String updatedAt,
        List<TestCaseSummary> cases
) {
}
