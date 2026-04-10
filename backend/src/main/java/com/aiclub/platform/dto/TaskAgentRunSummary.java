package com.aiclub.platform.dto;

public record TaskAgentRunSummary(
        Long id,
        Long taskId,
        String taskName,
        Long agentId,
        String agentName,
        String status,
        String input,
        String output,
        String errorMessage,
        Long requesterUserId,
        String requesterName,
        String createdAt
) {
}
