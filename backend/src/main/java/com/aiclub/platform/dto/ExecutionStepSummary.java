package com.aiclub.platform.dto;

public record ExecutionStepSummary(
        Long id,
        Long runId,
        Integer stepNo,
        String stepCode,
        String stepName,
        Long agentId,
        String agentName,
        String status,
        Integer progressPercent,
        String latestMessage,
        String inputSnapshot,
        String outputSnapshot,
        String errorMessage,
        String startedAt,
        String finishedAt
) {
}
