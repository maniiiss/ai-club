package com.aiclub.platform.dto;

import java.util.List;

/**
 * 外部回调 webhook 摘要。
 */
public record AiClubPipelineCallbackWebhookSummary(
        boolean enabled,
        String callbackUrlMasked,
        List<String> subscribedStatuses,
        String updatedAt,
        String lastDeliveryAt,
        String lastDeliveryStatus
) {
}
