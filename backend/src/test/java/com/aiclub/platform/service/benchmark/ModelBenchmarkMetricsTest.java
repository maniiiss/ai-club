package com.aiclub.platform.service.benchmark;

import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 指标聚合纯函数单测：覆盖空集、全失败、全成功、部分失败、token 估算、分位数等场景。
 * 不依赖 Spring 容器和外部 LLM，运行迅速。
 */
class ModelBenchmarkMetricsTest {

    @Test
    void aggregateHandlesEmptyResults() {
        ModelBenchmarkMetricEntity metric = newMetric();
        ModelBenchmarkMetrics.aggregate(metric, List.of(), 0L);

        assertThat(metric.getTotalCount()).isZero();
        assertThat(metric.getSuccessCount()).isZero();
        assertThat(metric.getFailureCount()).isZero();
        assertThat(metric.getFailureRate()).isZero();
        assertThat(metric.getThroughput()).isZero();
        assertThat(metric.getP50LatencyMs()).isZero();
        assertThat(metric.getP95LatencyMs()).isZero();
        assertThat(metric.getTokenEstimated()).isFalse();
    }

    @Test
    void aggregateHandlesAllFailures() {
        ModelBenchmarkMetricEntity metric = newMetric();
        List<BenchmarkInvocationResult> results = List.of(
                BenchmarkInvocationResult.failure(500L, "timeout"),
                BenchmarkInvocationResult.failure(800L, "5xx error")
        );

        ModelBenchmarkMetrics.aggregate(metric, results, 1300L);

        assertThat(metric.getTotalCount()).isEqualTo(2);
        assertThat(metric.getFailureCount()).isEqualTo(2);
        assertThat(metric.getSuccessCount()).isZero();
        assertThat(metric.getFailureRate()).isEqualTo(1.0);
        assertThat(metric.getAvgLatencyMs()).isZero();
        assertThat(metric.getThroughput()).isZero();
        assertThat(metric.getSampleError()).isEqualTo("timeout");
    }

    @Test
    void aggregateComputesPercentilesAndRates() {
        ModelBenchmarkMetricEntity metric = newMetric();
        // 10 个成功请求，latency 100, 200, 300, ..., 1000 ms
        List<BenchmarkInvocationResult> results = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            long latency = i * 100L;
            results.add(BenchmarkInvocationResult.success(
                    Math.max(10L, latency / 2),         // ttft 取一半
                    latency,
                    20,                                 // 每次 input 20 tokens
                    50,                                 // 每次 output 50 tokens
                    true,                               // 来自 usage
                    "ok"
            ));
        }

        // 墙钟 2 秒（5 并发下 10 个 100~1000ms 请求大约 2s）
        ModelBenchmarkMetrics.aggregate(metric, results, 2000L);

        assertThat(metric.getTotalCount()).isEqualTo(10);
        assertThat(metric.getSuccessCount()).isEqualTo(10);
        assertThat(metric.getFailureCount()).isZero();
        assertThat(metric.getFailureRate()).isZero();

        // 平均延迟：(100+...+1000)/10 = 550
        assertThat(metric.getAvgLatencyMs()).isEqualTo(550.0);
        // P50 取 nearest-rank：ceil(0.5*10)=5，第5个=500
        assertThat(metric.getP50LatencyMs()).isEqualTo(500.0);
        // P95：ceil(0.95*10)=10，第10个=1000
        assertThat(metric.getP95LatencyMs()).isEqualTo(1000.0);

        // 平均 output tokens
        assertThat(metric.getAvgOutputTokens()).isEqualTo(50.0);

        // 总 tokens = (20+50)*10 = 700，墙钟 2 秒 → 350 token/s
        assertThat(metric.getTotalTokenPerSec()).isEqualTo(350.0);
        // 生成 tokens 50*10 = 500 / 2s = 250
        assertThat(metric.getGenTokenPerSec()).isEqualTo(250.0);
        // 吞吐 10 / 2s = 5
        assertThat(metric.getThroughput()).isEqualTo(5.0);

        assertThat(metric.getTokenEstimated()).isFalse();
    }

    @Test
    void aggregateMarksEstimatedWhenAnyResultLacksUsage() {
        ModelBenchmarkMetricEntity metric = newMetric();
        List<BenchmarkInvocationResult> results = List.of(
                BenchmarkInvocationResult.success(50L, 100L, 10, 20, true, "ok"),
                BenchmarkInvocationResult.success(60L, 120L, 0, 18, false, "ok")
        );

        ModelBenchmarkMetrics.aggregate(metric, results, 500L);

        assertThat(metric.getTokenEstimated()).isTrue();
        assertThat(metric.getSuccessCount()).isEqualTo(2);
    }

    @Test
    void aggregateMixedSuccessAndFailureKeepsFirstError() {
        ModelBenchmarkMetricEntity metric = newMetric();
        List<BenchmarkInvocationResult> results = List.of(
                BenchmarkInvocationResult.success(50L, 100L, 10, 20, true, "ok"),
                BenchmarkInvocationResult.failure(200L, "boom"),
                BenchmarkInvocationResult.success(70L, 150L, 12, 25, true, "ok"),
                BenchmarkInvocationResult.failure(80L, "second-error")
        );

        ModelBenchmarkMetrics.aggregate(metric, results, 1000L);

        assertThat(metric.getTotalCount()).isEqualTo(4);
        assertThat(metric.getSuccessCount()).isEqualTo(2);
        assertThat(metric.getFailureCount()).isEqualTo(2);
        assertThat(metric.getFailureRate()).isEqualTo(0.5);
        assertThat(metric.getSampleError()).isEqualTo("boom");
        // 仅基于成功请求统计 avg latency = (100+150)/2 = 125
        assertThat(metric.getAvgLatencyMs()).isEqualTo(125.0);
    }

    @Test
    void percentileEdgeCases() {
        List<Long> empty = List.of();
        assertThat(ModelBenchmarkMetrics.percentile(empty, 0.5)).isZero();

        List<Long> single = List.of(42L);
        assertThat(ModelBenchmarkMetrics.percentile(single, 0.5)).isEqualTo(42L);
        assertThat(ModelBenchmarkMetrics.percentile(single, 0.95)).isEqualTo(42L);

        List<Long> two = List.of(10L, 20L);
        // p50 = ceil(0.5*2)=1 → index 0 = 10
        assertThat(ModelBenchmarkMetrics.percentile(two, 0.5)).isEqualTo(10L);
        // p95 = ceil(0.95*2)=2 → index 1 = 20
        assertThat(ModelBenchmarkMetrics.percentile(two, 0.95)).isEqualTo(20L);
    }

    private ModelBenchmarkMetricEntity newMetric() {
        ModelBenchmarkMetricEntity metric = new ModelBenchmarkMetricEntity();
        metric.setRunId(1L);
        metric.setModelId(2L);
        metric.setModelName("test-model");
        metric.setProvider("OPENAI");
        metric.setModelRealName("gpt-4o-mini");
        return metric;
    }
}
