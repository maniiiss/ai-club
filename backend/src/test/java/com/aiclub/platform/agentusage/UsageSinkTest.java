package com.aiclub.platform.agentusage;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class UsageSinkTest {

    @Test
    void setUsage四参重载_回填缓存字段() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, 150, 60);
        assertEquals(100, sink.getPromptTokens());
        assertEquals(50, sink.getCompletionTokens());
        assertEquals(150, sink.getTotalTokens());
        assertEquals(60, sink.getCachedTokens());
    }

    @Test
    void setUsage三参重载_缓存字段保持null() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, 150);
        assertNull(sink.getCachedTokens());
    }

    @Test
    void setCachedTokens_独立设置() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, 150);
        assertNull(sink.getCachedTokens());
        sink.setCachedTokens(40);
        assertEquals(40, sink.getCachedTokens());
    }

    @Test
    void totalTokens缺失时按prompt加completion求和() {
        UsageSink sink = new UsageSink();
        sink.setUsage(100, 50, null, 60);
        assertEquals(150, sink.getTotalTokens());
        assertEquals(60, sink.getCachedTokens());
    }
}
