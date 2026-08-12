package com.aiclub.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * 验证 ModelConfigService 各 extractor 正确抽取并归一化缓存命中 token：
 * OpenAI Responses（input_tokens_details.cached_tokens）、
 * OpenAI Chat（prompt_tokens_details.cached_tokens）、
 * Anthropic（cache_read_input_tokens）。
 */
class ModelConfigServiceUsageExtractTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ModelConfigService service = new ModelConfigService(null, null, null, mapper);

    private Object invokeExtract(String method, String json) throws Exception {
        Method m = ModelConfigService.class.getDeclaredMethod(method, JsonNode.class);
        m.setAccessible(true);
        return m.invoke(service, mapper.readTree(json));
    }

    private Integer cachedOf(Object usage) throws Exception {
        Method cached = usage.getClass().getDeclaredMethod("cached");
        cached.setAccessible(true);
        return (Integer) cached.invoke(usage);
    }

    @Test
    void openAiResponses_抽取input_tokens_details的cached_tokens() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,\"total_tokens\":150,"
                + "\"input_tokens_details\":{\"cached_tokens\":60}}}";
        Object u = invokeExtract("extractOpenAiUsage", json);
        assertNotNull(u);
        assertEquals(60, cachedOf(u));
    }

    @Test
    void openAiChat_抽取prompt_tokens_details的cached_tokens() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":70}}}";
        Object u = invokeExtract("extractOpenAiChatUsage", json);
        assertNotNull(u);
        assertEquals(70, cachedOf(u));
    }

    @Test
    void anthropic_抽取cache_read_input_tokens_不取cache_creation() throws Exception {
        String json = "{\"usage\":{\"input_tokens\":100,\"output_tokens\":50,"
                + "\"cache_read_input_tokens\":80,\"cache_creation_input_tokens\":20}}";
        Object u = invokeExtract("extractAnthropicUsage", json);
        assertNotNull(u);
        // 仅命中读取（80），不含写入缓存（20）
        assertEquals(80, cachedOf(u));
    }

    @Test
    void 无缓存字段时cached为null() throws Exception {
        String json = "{\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":50,\"total_tokens\":150}}";
        Object u = invokeExtract("extractOpenAiChatUsage", json);
        assertNotNull(u);
        assertNull(cachedOf(u));
    }

    @Test
    void usage缺失时返回null() throws Exception {
        Object u = invokeExtract("extractOpenAiUsage", "{\"foo\":1}");
        assertNull(u);
    }
}
