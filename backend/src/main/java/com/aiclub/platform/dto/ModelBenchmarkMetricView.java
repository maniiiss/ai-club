package com.aiclub.platform.dto;

import java.time.LocalDateTime;

/**
 * 模型对比测试中每个模型的指标视图。
 * 失败率使用 0~1 浮点数；耗时单位 ms；token 速率单位 token/s；吞吐 = 成功请求数 / 墙钟秒数。
 */
public record ModelBenchmarkMetricView(
        Long id,
        Long runId,
        Long modelId,
        String modelName,
        String provider,
        String modelRealName,
        String status,
        Integer totalCount,
        Integer successCount,
        Integer failureCount,
        Double failureRate,
        Double avgOutputTokens,
        Double avgTtftMs,
        Double avgLatencyMs,
        Double p50LatencyMs,
        Double p95LatencyMs,
        Double totalTokenPerSec,
        Double genTokenPerSec,
        Double throughput,
        Long wallTimeMs,
        Boolean tokenEstimated,
        String sampleError,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
