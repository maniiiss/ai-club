package com.aiclub.platform.dto;

import java.util.List;

/**
 * 事实面板使用的统一事实项。
 * 外层不直接暴露 Hindsight 原始结构，而是收敛为平台自己的稳定证据 DTO。
 */
public record MemoryFactItem(
        String id,
        String type,
        String subject,
        String predicate,
        String object,
        String summary,
        Double confidence,
        String sourceType,
        String createdAt,
        List<String> tags,
        String metadataJson
) {
}
