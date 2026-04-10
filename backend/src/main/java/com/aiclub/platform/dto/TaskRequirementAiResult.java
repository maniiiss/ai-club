package com.aiclub.platform.dto;

import java.util.List;

public record TaskRequirementAiResult(
        String action,
        String title,
        String markdown,
        Long modelConfigId,
        String modelConfigName,
        List<TaskRequirementAiSuggestion> taskSuggestions,
        List<TaskRequirementAiTestCaseSuggestion> testCaseSuggestions
) {
}
