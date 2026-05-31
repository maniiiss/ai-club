package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * Hermes 用户记忆整理后生成的结构化事实项。
 * 该视图和原始会话记忆分开返回，便于前端明确展示“整理后的结果”。
 */
public record HermesMemoryFactItem(
        String id,
        String summary,
        String predicate,
        String subject,
        String object,
        String sourceType,
        String createdAt,
        List<String> tags,
        Map<String, Object> metadata
) {
}
