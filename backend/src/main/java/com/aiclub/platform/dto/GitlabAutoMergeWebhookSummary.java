package com.aiclub.platform.dto;

import java.util.List;

/**
 * GitLab 自动合并外发 Webhook 摘要 DTO。
 * 出于安全考虑：URL 仅返回脱敏文本（{@code targetUrlMasked}），不暴露明文密文，也不返回明文 URL。
 */
public record GitlabAutoMergeWebhookSummary(
        Long id,
        Long configId,
        String name,
        String targetUrlMasked,
        List<String> subscribedEvents,
        String messageTemplate,
        Boolean enabled,
        String lastDeliveryAt,
        String lastDeliveryStatus,
        String lastDeliveryMessage
) {
}
