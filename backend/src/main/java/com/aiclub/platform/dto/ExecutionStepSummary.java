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
        String currentCommand,
        Long lastEventId,
        String lastEventAt,
        String lastHeartbeatAt,
        String tailLogText,
        Integer tailLogLineCount,
        boolean hasLiveStream,
        String inputSnapshot,
        String outputSnapshot,
        String errorMessage,
        String startedAt,
        String finishedAt
) {
}
