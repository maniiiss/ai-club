package com.aiclub.platform.dto;

import java.util.List;

/**
 * 记忆事实图节点摘要。
 * 节点 ID 对前端保持稳定字符串格式，避免与平台旧知识图谱的数值主键混淆。
 */
public record MemoryFactNodeSummary(
        String id,
        String entityType,
        String label,
        List<String> aliases,
        Integer degree,
        Integer factCount,
        String metadataJson
) {
}
