package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeAdapter;
import com.aiclub.platform.runtime.RuntimeAdapterType;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.aiclub.platform.runtime.RuntimeChatResult;
import com.aiclub.platform.runtime.RuntimeDescriptor;
import com.aiclub.platform.runtime.RuntimeHealth;
import com.aiclub.platform.runtime.RuntimeHealthStatus;
import com.aiclub.platform.runtime.RuntimeInvocationContext;
import com.aiclub.platform.runtime.RuntimeStreamEvent;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 验证统一 Runtime 事件可将上下文压缩状态传递给上层展示。 */
class RuntimeChatServiceTests {

    @Test
    void shouldForwardNativeContextCompactionWithoutTreatingItAsText() {
        RuntimeRegistryService registryService = mock(RuntimeRegistryService.class);
        RuntimeAdapterRegistry adapterRegistry = mock(RuntimeAdapterRegistry.class);
        RuntimeToolContractService toolContractService = mock(RuntimeToolContractService.class);
        RuntimeAdapter adapter = new RuntimeAdapter() {
            @Override
            public RuntimeDescriptor descriptor() {
                return new RuntimeDescriptor("PI_RUNTIME", RuntimeAdapterType.STATEFUL_AGENT, "test", "1",
                        Set.of(RuntimeCapability.CHAT, RuntimeCapability.STREAM_EVENTS), "{}");
            }

            @Override
            public RuntimeHealth healthCheck() {
                return new RuntimeHealth("PI_RUNTIME", RuntimeHealthStatus.HEALTHY, "ok", null);
            }

            @Override
            public RuntimeChatResult streamChat(RuntimeInvocationContext context,
                                                java.util.function.Consumer<RuntimeStreamEvent> eventConsumer) {
                eventConsumer.accept(new RuntimeStreamEvent("run-1", "session-1", 1,
                        "CONTEXT_COMPACTED", Map.of("strategy", "NATIVE_PI")));
                eventConsumer.accept(new RuntimeStreamEvent("run-1", "session-1", 2,
                        "TEXT_DELTA", Map.of("delta", "整理后的回答")));
                return new RuntimeChatResult("run-1", "session-1", "整理后的回答", RuntimeHealthStatus.HEALTHY);
            }
        };
        when(registryService.isAvailable(eq("PI_RUNTIME"), anySet())).thenReturn(true);
        when(adapterRegistry.require("PI_RUNTIME")).thenReturn(adapter);
        RuntimeChatService service = new RuntimeChatService(registryService, adapterRegistry, toolContractService);
        List<RuntimeStreamEvent> events = new ArrayList<>();

        RuntimeChatResult result = service.streamChat("PI_RUNTIME",
                new RuntimeInvocationContext("run-1", "session-1", "问题", "系统提示", Map.of(), Map.of()),
                events::add);

        assertThat(result.content()).isEqualTo("整理后的回答");
        assertThat(events).extracting(RuntimeStreamEvent::eventType)
                .containsExactly("CONTEXT_COMPACTED", "TEXT_DELTA");
    }
}
