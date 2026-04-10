package com.aiclub.platform.dto;

import java.util.List;

public record TaskRequirementAiTestCaseSuggestion(
        String title,
        String moduleName,
        String caseType,
        String priority,
        String precondition,
        String remarks,
        List<TaskRequirementAiTestCaseStepSuggestion> steps
) {
}
