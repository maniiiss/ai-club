package com.aiclub.platform.dto;

import java.util.List;

public record ExecutionRunDetail(
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
        String createdAt,
        List<ExecutionStepSummary> steps,
        List<ExecutionArtifactSummary> artifacts
) {
}
