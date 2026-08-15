package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 验证 GitPilotModelProxyService.UsageAccumulator 从流式 chunk 抽取缓存命中 token：
 * OpenAI（流末 usage.prompt_tokens_details.cached_tokens，嵌套）与
 * Anthropic（message_start 的 cache_read_input_tokens）。
 */
class GitPilotModelProxyServiceUsageAccumulatorTest {

    private final GitPilotModelProxyService service =
            new GitPilotModelProxyService(null, null, null, new ObjectMapper(), null, null, null);

    @Test
    void observe_openAi流末抽取cached_tokens() {
        GitPilotModelProxyService.UsageAccumulator acc = service.new UsageAccumulator();
        acc.observe("{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,"
                + "\"total_tokens\":150,\"prompt_tokens_details\":{\"cached_tokens\":60}}}", "OPENAI");
        assertEquals(60, acc.cachedTokens);
    }

    @Test
    void observe_anthropicMessageStart抽取cache_read() {
        GitPilotModelProxyService.UsageAccumulator acc = service.new UsageAccumulator();
        acc.observe("{\"type\":\"message_start\",\"message\":{\"usage\":"
                + "{\"input_tokens\":100,\"cache_read_input_tokens\":80}}}", "ANTHROPIC");
        assertEquals(80, acc.cachedTokens);
    }

    @Test
    void observe_无缓存字段时cachedTokens为null() {
        GitPilotModelProxyService.UsageAccumulator acc = service.new UsageAccumulator();
        acc.observe("{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150}}", "OPENAI");
        assertNull(acc.cachedTokens);
    }
}
