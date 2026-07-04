package com.aiclub.platform.dto;

public record TaskRequirementAiSuggestion(
        String name,
        /**
         * 任务细分类型，用于把需求拆解建议同步创建为可分类管理的子任务。
         */
        String taskType,
        String priority,
        String description
) {
}
