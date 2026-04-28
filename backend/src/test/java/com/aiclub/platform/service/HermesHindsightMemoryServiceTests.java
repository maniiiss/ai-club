package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
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
 * 验证 Hermes 的 Hindsight 记忆召回会按当前作用域取数，并把结果压成 Prompt 友好的摘要。
 */
@ExtendWith(MockitoExtension.class)
class HermesHindsightMemoryServiceTests {

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private HindsightMemoryFallbackService hindsightMemoryFallbackService;

    @Mock
    private WikiSpaceService wikiSpaceService;

    @Test
    void shouldRecallProjectFactsFromProjectAndSharedBanks() {
        HindsightProperties properties = new HindsightProperties(
                "http://localhost:18888",
                "",
                "git-ai-club",
                "mid",
                30,
                "",
                "{bankPrefix}:memory:shared",
                "/v1/default/banks/{bankId}/graph",
                "/v1/default/banks/{bankId}/entities/{entityId}",
                "/v1/default/banks/{bankId}/memories/recall",
                true,
                "jdbc:postgresql://localhost:5432/hindsight",
                "aiclub",
                "aiclub123"
        );
        HermesHindsightMemoryService service = new HermesHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                properties,
                wikiSpaceService
        );

        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesChatRequest request = new HermesChatRequest(
                "巴黎和柏林最近在项目知识里有什么联系",
                "project-iterations",
                12L,
                null,
                null,
                null,
                null,
                null,
                "conversation-1",
                null,
                false
        );

        when(wikiSpaceService.buildProjectGraphProjection(12L)).thenReturn(new WikiSpaceService.WikiProjectGraphProjection(
                List.<WikiSpaceEntity>of(),
                List.<WikiDirectoryEntity>of(),
                List.<WikiPageV2Entity>of()
        ));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:project:12"), eq("巴黎和柏林最近在项目知识里有什么联系"), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-1",
                        "world",
                        "Paris",
                        "co_occurrence",
                        "Berlin",
                        "Paris and Berlin are often discussed together.",
                        0.88d,
                        "WIKI",
                        "2026-04-24T09:00:00Z",
                        List.of("project:12", "source:wiki"),
                        Map.of()
                )));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:memory:shared"), eq("巴黎和柏林最近在项目知识里有什么联系"), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-2",
                        "world",
                        "Paris",
                        "risk",
                        "Release",
                        "Shared memory says the release note also mentions Paris.",
                        0.61d,
                        "MEMORY",
                        "2026-04-23T09:00:00Z",
                        List.of("project:12"),
                        Map.of()
                )));

        String markdown = service.buildMemoryContextMarkdown(context, request);

        assertThat(markdown)
                .contains("Paris and Berlin are often discussed together.")
                .contains("来源：项目 Wiki")
                .contains("来源：共享记忆")
                .contains("标签：project:12");
        verify(hindsightClientService).recallWorldFacts("git-ai-club:wiki:project:12", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
        verify(hindsightClientService).recallWorldFacts("git-ai-club:memory:shared", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
    }
}
