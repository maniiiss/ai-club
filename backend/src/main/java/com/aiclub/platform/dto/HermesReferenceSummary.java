package com.aiclub.platform.dto;

/**
 * Hermes 回答中引用的业务对象摘要。
 */
public record HermesReferenceSummary(
        String type,
        Long id,
        String title,
        String route
) {
}
