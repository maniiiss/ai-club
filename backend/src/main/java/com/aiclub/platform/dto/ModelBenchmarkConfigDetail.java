package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 模型对比测试配置详情：抽屉顶部"配置摘要 + 编辑/运行/取消"按钮使用。
 *
 * <p>{@code hasActiveRun} 为 true 时前端置灰"立即运行"按钮，并显示"取消运行"。</p>
 */
public record ModelBenchmarkConfigDetail(
        Long id,
        String name,
        Integer concurrency,
        Integer totalRequests,
        Boolean streamEnabled,
        Integer maxTokens,
        String systemPrompt,
        String userPrompt,
        List<Long> modelIds,
        Long createdBy,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        Long runCount,
        Boolean hasActiveRun,
        /** 当前 active run 的 id（如有），便于前端直接发起 cancel。 */
        Long activeRunId,
        /** 最近一次 run 摘要（无论是否仍在跑）；从未运行时为 null。 */
        ModelBenchmarkRunSummary latestRun
) {
}
