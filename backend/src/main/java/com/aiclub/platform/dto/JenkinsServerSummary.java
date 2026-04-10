package com.aiclub.platform.dto;

public record JenkinsServerSummary(
        Long id,
        String name,
        String baseUrl,
        String username,
        String description,
        boolean enabled,
        boolean tokenConfigured,
        String lastTestStatus,
        String lastTestMessage,
        String lastTestedAt,
        Integer lastJobCount
) {
}
