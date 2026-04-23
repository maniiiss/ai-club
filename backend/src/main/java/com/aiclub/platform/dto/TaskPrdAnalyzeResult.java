package com.aiclub.platform.dto;

import java.util.List;

/**
 * 需求 PRD AI 分析结果。
 */
public record TaskPrdAnalyzeResult(
        String action,
        String title,
        String markdown,
        String suggestionMarkdown,
        Long modelConfigId,
        String modelConfigName,
        List<String> gaps,
        List<String> questions,
        List<TaskPrdRecallReference> references
) {
    public TaskPrdAnalyzeResult {
        gaps = gaps == null ? List.of() : List.copyOf(gaps);
        questions = questions == null ? List.of() : List.copyOf(questions);
        references = references == null ? List.of() : List.copyOf(references);
    }
}
