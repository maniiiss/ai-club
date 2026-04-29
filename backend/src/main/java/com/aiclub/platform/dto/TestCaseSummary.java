package com.aiclub.platform.dto;

import java.util.List;

public record TestCaseSummary(
        Long id,
        String title,
        String moduleName,
        String caseType,
        String priority,
        String precondition,
        String remarks,
        Integer sortOrder,
        String automationType,
        String automationHint,
        List<TestCaseStepSummary> steps
) {
}
