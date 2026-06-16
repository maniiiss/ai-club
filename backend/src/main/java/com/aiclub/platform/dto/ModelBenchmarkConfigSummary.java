package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 模型对比测试配置列表行。
 *
 * <p>每行除配置基本信息外，附带"最近一次运行摘要 + 历史运行次数"，
 * 让用户在列表页就能看到该配置的运行态而不必点开抽屉。</p>
 */
public record ModelBenchmarkConfigSummary(
        Long id,
        String name,
        Integer concurrency,
        Integer totalRequests,
        Boolean streamEnabled,
        Integer maxTokens,
        Integer modelCount,
        List<Long> modelIds,
        Long createdBy,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /** 该 config 历史 run 总次数。 */
        Long runCount,
        /** 最近一次 run 的轻量摘要；从未运行时为 null。 */
        ModelBenchmarkRunSummary latestRun
) {
}
