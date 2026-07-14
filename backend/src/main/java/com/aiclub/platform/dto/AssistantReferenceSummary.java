package com.aiclub.platform.dto;

/**
 * Assistant 回答中引用的业务对象摘要。
 */
public record AssistantReferenceSummary(
        String type,
        Long id,
        String title,
        String route
) {
}
