package com.aiclub.platform.service.benchmark;

/**
 * 模型对比测试中"单次请求"的执行结果。
 * 所有时间以毫秒为单位；inputTokens/outputTokens 为 0 时表示接口未返回 usage，可由调用方按文本长度估算。
 */
public record BenchmarkInvocationResult(
        boolean success,
        long ttftMs,
        long totalMs,
        int inputTokens,
        int outputTokens,
        boolean tokensFromUsage,
        String errorMessage,
        String sampleOutput
) {

    public static BenchmarkInvocationResult success(long ttftMs, long totalMs, int inputTokens, int outputTokens, boolean tokensFromUsage, String sampleOutput) {
        return new BenchmarkInvocationResult(true, ttftMs, totalMs, inputTokens, outputTokens, tokensFromUsage, null, sampleOutput);
    }

    public static BenchmarkInvocationResult failure(long totalMs, String errorMessage) {
        return new BenchmarkInvocationResult(false, 0L, totalMs, 0, 0, false, errorMessage, null);
    }
}
