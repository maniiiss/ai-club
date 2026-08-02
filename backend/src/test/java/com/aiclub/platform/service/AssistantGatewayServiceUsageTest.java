package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 验证 AssistantGatewayService.extractUsage 正确抽取缓存命中 token：
 * OpenAI Chat（prompt_tokens_details.cached_tokens，嵌套）与
 * Anthropic（cache_read_input_tokens，顶层）。
 */
class AssistantGatewayServiceUsageTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AssistantGatewayService service = new AssistantGatewayService(null, mapper);

    private Object invokeExtract(String json) throws Exception {
        Method m = AssistantGatewayService.class.getDeclaredMethod("extractUsage", JsonNode.class);
        m.setAccessible(true);
        return m.invoke(service, mapper.readTree(json));
    }

    private Integer cachedOf(Object usage) throws Exception {
        Method cached = usage.getClass().getDeclaredMethod("cachedTokens");
        cached.setAccessible(true);
        return (Integer) cached.invoke(usage);
    }

    @Test
    void openAiChat_抽取嵌套prompt_tokens_details的cached_tokens() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":65}}}";
        Object u = invokeExtract(json);
        assertNotNull(u);
        assertEquals(65, cachedOf(u));
    }

    @Test
    void anthropic_抽取顶层cache_read_input_tokens() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,"
                + "\"cache_read_input_tokens\":75}}";
        Object u = invokeExtract(json);
        assertNotNull(u);
        assertEquals(75, cachedOf(u));
    }

    @Test
    void 无缓存字段时cachedTokens为null() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150}}";
        Object u = invokeExtract(json);
        assertNotNull(u);
        assertNull(cachedOf(u));
    }

    @Test
    void usage缺失时返回null() throws Exception {
        Object u = invokeExtract("{\"foo\":1}");
        assertNull(u);
    }
}
