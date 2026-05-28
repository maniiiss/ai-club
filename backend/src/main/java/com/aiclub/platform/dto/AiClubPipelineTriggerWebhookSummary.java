package com.aiclub.platform.dto;

/**
 * 公开触发 webhook 摘要。
 */
public record AiClubPipelineTriggerWebhookSummary(
        boolean enabled,
        String triggerUrl,
        String maskedToken,
        String updatedAt
) {
}
