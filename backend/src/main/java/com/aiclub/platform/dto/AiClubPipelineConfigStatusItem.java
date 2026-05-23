package com.aiclub.platform.dto;

public record AiClubPipelineConfigStatusItem(
        String status,
        String branch,
        String configPath,
        String message,
        String checkedAt
) {
}
