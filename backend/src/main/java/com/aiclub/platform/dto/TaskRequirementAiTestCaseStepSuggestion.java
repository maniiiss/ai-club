package com.aiclub.platform.dto;

public record TaskRequirementAiTestCaseStepSuggestion(
        Integer stepNo,
        String action,
        String expectedResult
) {
}
