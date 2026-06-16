package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 模型对比测试列表行，包含基本配置和进度，便于在列表页快速感知运行状态。
 */
public record ModelBenchmarkRunSummary(
        Long id,
        String name,
        String status,
        Integer concurrency,
        Integer totalRequests,
        Boolean streamEnabled,
        Integer maxTokens,
        Integer modelCount,
        List<Long> modelIds,
        Integer progressTotal,
        Integer progressDone,
        Long createdBy,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime finishedAt
) {
}
