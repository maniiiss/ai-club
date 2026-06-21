package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 模型对比测试列表行，包含基本配置和进度，便于在列表页快速感知运行状态。
 *
 * <p>注意：本对象内的 name/concurrency/.../modelIds 字段都是触发瞬间从 config
 * 拷贝的"运行时快照"，与当前 config 字段可能存在差异。</p>
 */
public record ModelBenchmarkRunSummary(
        Long id,
        Long configId,
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
