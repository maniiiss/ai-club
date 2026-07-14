package com.aiclub.platform.memory;

import com.aiclub.platform.service.HindsightClientService;
import com.aiclub.platform.service.HindsightMemoryFallbackService;
import com.aiclub.platform.service.HindsightProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Hindsight 适配器只承担 Provider 协议转换，不让 Assistant 业务层感知 Hindsight DTO。
 */
@ExtendWith(MockitoExtension.class)
class HindsightMemoryProviderTests {

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private HindsightMemoryFallbackService fallbackService;

    @Test
    void shouldMapHindsightRecallToGenericMemoryRecord() {
        HindsightMemoryProvider provider = provider();
        when(hindsightClientService.recallMemories(
                eq("git-ai-club:hermes:user:5"), eq("发布时间"), eq(List.of()), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryRecallHit(
                        "hermes-conversation:c1:turn:1", "标题", "记忆正文", 0.9d
                )));

        List<MemoryProvider.MemoryRecord> records = provider.recall(new MemoryProvider.MemoryQuery(
                provider.assistantUserScope(5L),
                MemoryProvider.MemoryKind.CONVERSATION,
                "发布时间",
                List.of(),
                3
        ));

        assertThat(records).singleElement().satisfies(record -> {
            assertThat(record.id()).isEqualTo("hermes-conversation:c1:turn:1");
            assertThat(record.summary()).isEqualTo("记忆正文");
            assertThat(record.sourceType()).isEqualTo("ASSISTANT_USER_MEMORY");
        });
    }

    @Test
    void shouldHideBankMappingWhenRetainingConversationMemory() {
        HindsightMemoryProvider provider = provider();
        MemoryProvider.MemoryScope scope = provider.assistantUserScope(5L);
        MemoryProvider.MemoryDocument document = new MemoryProvider.MemoryDocument(
                "hermes-conversation:c1:turn:1",
                "标题",
                "正文",
                List.of("user:5"),
                Map.of("memoryType", "conversation"),
                "assistant",
                "conversation"
        );

        provider.retain(scope, document);

        verify(hindsightClientService).retainAssistantConversationMemory(
                5L,
                "hermes-conversation:c1:turn:1",
                "标题",
                "正文",
                List.of("user:5"),
                Map.of("memoryType", "conversation")
        );
    }

    private HindsightMemoryProvider provider() {
        return new HindsightMemoryProvider(
                hindsightClientService,
                fallbackService,
                new HindsightProperties(
                        "http://localhost:18888",
                        "",
                        "git-ai-club",
                        "mid",
                        30,
                        "",
                        "",
                        "/v1/default/banks/{bankId}/graph",
                        "/v1/default/banks/{bankId}/entities/{entityId}",
                        "/v1/default/banks/{bankId}/memories/recall",
                        true,
                        "jdbc:postgresql://localhost:5432/hindsight",
                        "aiclub",
                        "aiclub123"
                )
        );
    }
}
