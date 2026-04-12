package com.aiclub.platform.dto;

public record ExecutionRunSummary(
        Long id,
        Long executionTaskId,
        Integer runNo,
        String status,
        Integer progressPercent,
        Integer currentStepNo,
        String currentStepName,
        String inputSnapshot,
        String outputSummary,
        String errorMessage,
        String startedAt,
        String finishedAt,
        String createdAt
) {
}
