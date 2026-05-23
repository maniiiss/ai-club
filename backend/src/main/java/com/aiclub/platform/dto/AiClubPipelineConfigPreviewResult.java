package com.aiclub.platform.dto;

public record AiClubPipelineConfigPreviewResult(
        String templateCode,
        String content,
        String branch,
        String configPath
) {
}
