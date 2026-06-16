package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 模型对比测试详情：整体配置 + 实时进度 + 各模型指标行。
 * RUNNING 状态下指标行也会一并返回当前累计值，便于前端绘制实时表格。
 */
public record ModelBenchmarkRunDetail(
        Long id,
        String name,
        String status,
        Integer concurrency,
        Integer totalRequests,
        Boolean streamEnabled,
        Integer maxTokens,
        String systemPrompt,
        String userPrompt,
        List<Long> modelIds,
        Integer progressTotal,
        Integer progressDone,
        String errorMessage,
        Long createdBy,
        String createdByName,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime finishedAt,
        List<ModelBenchmarkMetricView> metrics
) {
}
