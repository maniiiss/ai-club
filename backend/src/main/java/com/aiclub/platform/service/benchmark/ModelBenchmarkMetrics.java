package com.aiclub.platform.service.benchmark;

import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 指标聚合纯函数：从一批 BenchmarkInvocationResult + 总墙钟时间计算汇总数值。
 *
 * P50/P95 取"成功请求"的延迟序列；token/s 与吞吐使用墙钟时间，避免 0 除问题。
 * 把它独立出来便于单测，不依赖 Spring 容器。
 */
public final class ModelBenchmarkMetrics {

    private ModelBenchmarkMetrics() {
    }

    /**
     * 把单模型一轮压测的全部结果聚合到目标 metric 实体上。
     *
     * @param target      待写入的指标实体（其 modelId / modelName 等已由调用方填充）
     * @param results     实际产出的结果集
     * @param wallTimeMs  本模型从第一次发请求到最后一次完成的墙钟时间（毫秒）
     */
    public static void aggregate(ModelBenchmarkMetricEntity target,
                                 List<BenchmarkInvocationResult> results,
                                 long wallTimeMs) {
        int total = results == null ? 0 : results.size();
        target.setTotalCount(total);
        target.setWallTimeMs(Math.max(0L, wallTimeMs));

        if (total == 0) {
            target.setSuccessCount(0);
            target.setFailureCount(0);
            target.setFailureRate(0.0);
            target.setAvgOutputTokens(0.0);
            target.setAvgTtftMs(0.0);
            target.setAvgLatencyMs(0.0);
            target.setP50LatencyMs(0.0);
            target.setP95LatencyMs(0.0);
            target.setTotalTokenPerSec(0.0);
            target.setGenTokenPerSec(0.0);
            target.setThroughput(0.0);
            target.setTokenEstimated(false);
            return;
        }

        int success = 0;
        int failure = 0;
        long ttftSum = 0L;
        long latencySum = 0L;
        long inputTokenSum = 0L;
        long outputTokenSum = 0L;
        boolean anyEstimated = false;
        String firstError = null;

        List<Long> latencies = new ArrayList<>(total);
        for (BenchmarkInvocationResult r : results) {
            if (r.success()) {
                success++;
                ttftSum += r.ttftMs();
                latencySum += r.totalMs();
                inputTokenSum += r.inputTokens();
                outputTokenSum += r.outputTokens();
                latencies.add(r.totalMs());
                if (!r.tokensFromUsage()) {
                    anyEstimated = true;
                }
            } else {
                failure++;
                if (firstError == null) {
                    firstError = r.errorMessage();
                }
            }
        }

        target.setSuccessCount(success);
        target.setFailureCount(failure);
        target.setFailureRate(round4((double) failure / (double) total));

        if (success > 0) {
            target.setAvgOutputTokens(round2((double) outputTokenSum / success));
            target.setAvgTtftMs(round2((double) ttftSum / success));
            target.setAvgLatencyMs(round2((double) latencySum / success));

            Collections.sort(latencies);
            target.setP50LatencyMs((double) percentile(latencies, 0.5));
            target.setP95LatencyMs((double) percentile(latencies, 0.95));
        } else {
            target.setAvgOutputTokens(0.0);
            target.setAvgTtftMs(0.0);
            target.setAvgLatencyMs(0.0);
            target.setP50LatencyMs(0.0);
            target.setP95LatencyMs(0.0);
        }

        double seconds = wallTimeMs <= 0 ? 0.0 : wallTimeMs / 1000.0;
        if (seconds > 0) {
            target.setTotalTokenPerSec(round2((inputTokenSum + outputTokenSum) / seconds));
            target.setGenTokenPerSec(round2(outputTokenSum / seconds));
            target.setThroughput(round2(success / seconds));
        } else {
            target.setTotalTokenPerSec(0.0);
            target.setGenTokenPerSec(0.0);
            target.setThroughput(0.0);
        }

        target.setTokenEstimated(anyEstimated);
        target.setSampleError(firstError);
    }

    /** 按 nearest-rank 取分位数：rank = ceil(p * n)，便于在小样本下行为可预期。 */
    static long percentile(List<Long> sortedAsc, double percentile) {
        if (sortedAsc.isEmpty()) {
            return 0L;
        }
        if (percentile <= 0) {
            return sortedAsc.get(0);
        }
        if (percentile >= 1) {
            return sortedAsc.get(sortedAsc.size() - 1);
        }
        int rank = (int) Math.ceil(percentile * sortedAsc.size());
        rank = Math.max(1, Math.min(rank, sortedAsc.size()));
        return sortedAsc.get(rank - 1);
    }

    private static double round2(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return 0.0;
        }
        return Math.round(value * 100.0) / 100.0;
    }

    private static double round4(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return 0.0;
        }
        return Math.round(value * 10000.0) / 10000.0;
    }
}
