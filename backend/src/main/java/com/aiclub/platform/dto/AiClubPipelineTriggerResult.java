package com.aiclub.platform.dto;

public record AiClubPipelineTriggerResult(
        Long pipelineId,
        String projectName,
        String pipelineName,
        String providerCode,
        Integer runNumber,
        String status,
        String triggerUrl,
        String message,
        String triggeredAt
) {
}
