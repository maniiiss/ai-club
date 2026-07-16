package com.aiclub.platform.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 AgentRuntime 通用历史消息契约。 */
class RuntimeInvocationContextTests {

    @Test
    void shouldInjectCanonicalConversationHistoryIntoHttpRuntimeRequest() {
        RuntimeInvocationContext context = new RuntimeInvocationContext(
                "run-1", "session-1", "本轮输入", "系统提示",
                Map.of("requestBody", Map.of("contextProfile", Map.of())), Map.of()
        ).withConversationHistory(List.of(
                new RuntimeConversationMessage("user", "第一轮问题"),
                new RuntimeConversationMessage("assistant", "第一轮回答")
        ));
        HttpRuntimeAdapter adapter = new HttpRuntimeAdapter(
                null, "PI_RUNTIME", "http://localhost:9010", "", null, new ObjectMapper()
        );

        JsonNode history = adapter.requestBody(context).path("history");

        assertThat(history).hasSize(2);
        assertThat(history.get(0).path("role").asText()).isEqualTo("user");
        assertThat(history.get(0).path("content").asText()).isEqualTo("第一轮问题");
        assertThat(history.get(1).path("role").asText()).isEqualTo("assistant");
        assertThat(history.get(1).path("content").asText()).isEqualTo("第一轮回答");
    }
}
