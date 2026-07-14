package com.aiclub.platform.dto;

import java.util.Map;

/**
 * Assistant 用户记忆条目，用于记忆管理列表展示。
 */
public record AssistantUserMemoryItem(
        String documentId,
        String title,
        String snippet,
        String question,
        String answer,
        String scene,
        String createdAt,
        Map<String, Object> metadata
) {
}
