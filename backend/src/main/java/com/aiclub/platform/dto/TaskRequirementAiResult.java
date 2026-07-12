package com.aiclub.platform.dto;

import java.util.List;

public record TaskRequirementAiResult(
        String action,
        String title,
        String markdown,
        Long modelConfigId,
        String modelConfigName,
        List<TaskRequirementAiSuggestion> taskSuggestions,
        List<TaskRequirementAiTestCaseSuggestion> testCaseSuggestions,
        List<RequirementAiResultImage> images
) {
    public TaskRequirementAiResult {
        taskSuggestions = taskSuggestions == null ? List.of() : List.copyOf(taskSuggestions);
        testCaseSuggestions = testCaseSuggestions == null ? List.of() : List.copyOf(testCaseSuggestions);
        images = images == null ? List.of() : List.copyOf(images);
    }

    /** 兼容已有调用方和历史测试，旧结果默认没有结构化图片元数据。 */
    public TaskRequirementAiResult(String action,
                                   String title,
                                   String markdown,
                                   Long modelConfigId,
                                   String modelConfigName,
                                   List<TaskRequirementAiSuggestion> taskSuggestions,
                                   List<TaskRequirementAiTestCaseSuggestion> testCaseSuggestions) {
        this(action, title, markdown, modelConfigId, modelConfigName, taskSuggestions, testCaseSuggestions, List.of());
    }
}
