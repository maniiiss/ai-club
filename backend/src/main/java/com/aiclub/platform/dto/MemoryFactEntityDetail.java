package com.aiclub.platform.dto;

import java.util.List;

/**
 * 单实体详情。
 * 详情面板会同时展示实体观察记录与关联事实，因此这里直接带上 observations 和 facts。
 */
public record MemoryFactEntityDetail(
        Long projectId,
        String entityId,
        String label,
        String entityType,
        List<String> aliases,
        Integer degree,
        Integer factCount,
        List<String> observations,
        String metadataJson,
        List<String> warnings,
        List<MemoryFactItem> facts
) {
}
