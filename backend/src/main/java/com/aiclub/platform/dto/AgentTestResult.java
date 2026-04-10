package com.aiclub.platform.dto;

public record AgentTestResult(
        Long agentId,
        String agentName,
        boolean success,
        String message,
        String output,
        String testedAt
) {
}
