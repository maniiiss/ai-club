package com.aiclub.platform.runtime;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 Runtime 统一流式事件的兼容行为。 */
class RuntimeStreamEventTests {

    @Test
    void shouldNormalizeEventTypeAndExtractTextDelta() {
        RuntimeStreamEvent event = new RuntimeStreamEvent(
                "run-1", "session-1", 2, "text_delta", Map.of("delta", "你好"));

        assertThat(event.eventType()).isEqualTo("TEXT_DELTA");
        assertThat(event.is("text_delta")).isTrue();
        assertThat(event.textDelta()).isEqualTo("你好");
    }

    @Test
    void defaultStreamChatShouldKeepLegacyRuntimeUsableAsSingleDelta() {
        RuntimeAdapter adapter = new RuntimeAdapter() {
            @Override
            public RuntimeDescriptor descriptor() {
                return new RuntimeDescriptor("LEGACY_TEST", RuntimeAdapterType.CHAT_GATEWAY,
                        "test", "1", java.util.Set.of(RuntimeCapability.CHAT), "{}");
            }

            @Override
            public RuntimeHealth healthCheck() {
                return new RuntimeHealth("LEGACY_TEST", RuntimeHealthStatus.HEALTHY, "ok", null);
            }

            @Override
            public RuntimeChatResult chat(RuntimeInvocationContext context) {
                return new RuntimeChatResult("run-1", "session-1", "完整回答", RuntimeHealthStatus.HEALTHY);
            }
        };
        List<RuntimeStreamEvent> events = new ArrayList<>();

        RuntimeChatResult result = adapter.streamChat(
                new RuntimeInvocationContext("run-1", "session-1", "问题", "系统提示", Map.of(), Map.of()),
                events::add);

        assertThat(result.content()).isEqualTo("完整回答");
        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.eventType()).isEqualTo("TEXT_DELTA");
            assertThat(event.textDelta()).isEqualTo("完整回答");
        });
    }

    @Test
    void shouldConvertThinkingEventsToCollapsibleThinkMarkup() {
        RuntimeStreamContentAssembler assembler = new RuntimeStreamContentAssembler();

        assertThat(assembler.accept(new RuntimeStreamEvent("run", "session", 1,
                "THINKING_START", Map.of()))).isEqualTo("<think>");
        assertThat(assembler.accept(new RuntimeStreamEvent("run", "session", 2,
                "THINKING_DELTA", Map.of("delta", "先确认上下文")))).isEqualTo("先确认上下文");
        assertThat(assembler.accept(new RuntimeStreamEvent("run", "session", 3,
                "THINKING_END", Map.of()))).isEqualTo("</think>");
        assertThat(assembler.accept(new RuntimeStreamEvent("run", "session", 4,
                "TEXT_DELTA", Map.of("delta", "最终结论")))).isEqualTo("最终结论");
    }
}
