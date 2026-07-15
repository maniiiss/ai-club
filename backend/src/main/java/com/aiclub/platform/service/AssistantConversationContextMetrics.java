package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeContextProfile;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;

/**
 * GitPilot 上下文预算指标。
 * 业务意图：运营侧可以区分上下文使用、backend 压缩和溢出风险，不依赖日志抽样判断长对话质量。
 */
@Service
public class AssistantConversationContextMetrics {

    private final MeterRegistry meterRegistry;

    public AssistantConversationContextMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordPrepared(RuntimeContextProfile profile, int estimatedTokens) {
        DistributionSummary.builder("gitpilot_context_estimated_tokens")
                .description("GitPilot 每轮估算的上下文 token 数")
                .tag("strategy", strategy(profile))
                .register(meterRegistry)
                .record(Math.max(0, estimatedTokens));
    }

    public void recordCompaction(RuntimeContextProfile profile) {
        Counter.builder("gitpilot_context_compactions_total")
                .description("GitPilot backend 上下文压缩次数")
                .tag("strategy", strategy(profile))
                .register(meterRegistry)
                .increment();
    }

    public void recordOverflow(RuntimeContextProfile profile) {
        Counter.builder("gitpilot_context_overflows_total")
                .description("GitPilot 上下文预算无法容纳单条消息的次数")
                .tag("strategy", strategy(profile))
                .register(meterRegistry)
                .increment();
    }

    public void recordFallback(RuntimeContextProfile profile) {
        Counter.builder("gitpilot_context_fallbacks_total")
                .description("GitPilot backend 上下文 fallback 压缩次数")
                .tag("strategy", strategy(profile))
                .register(meterRegistry)
                .increment();
    }

    public void recordNativeCompaction(String runtimeCode) {
        Counter.builder("gitpilot_context_native_compactions_total")
                .description("GitPilot Runtime 原生上下文压缩次数")
                .tag("runtime", runtimeCode == null || runtimeCode.isBlank() ? "UNKNOWN" : runtimeCode)
                .register(meterRegistry)
                .increment();
    }

    private String strategy(RuntimeContextProfile profile) {
        return profile == null || profile.compactionStrategy() == null
                ? "UNKNOWN" : profile.compactionStrategy().name();
    }
}
