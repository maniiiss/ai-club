package com.aiclub.platform.dto;

public record JenkinsBuildTriggerResult(
        Long bindingId,
        String projectName,
        String jenkinsServerName,
        String jobName,
        String triggerUrl,
        String message,
        String triggeredAt
) {
}
