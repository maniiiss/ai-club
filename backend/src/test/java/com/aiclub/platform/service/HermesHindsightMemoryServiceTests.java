package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 的 Hindsight 用户记忆召回与写入都按用户隔离执行。
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
    void shouldRecallUserBankBeforeProjectAndSharedBanks() {
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

        CurrentUserInfo currentUser = currentUser();
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
        when(hindsightClientService.recallMemories(eq("git-ai-club:hermes:user:5"), eq("巴黎和柏林最近在项目知识里有什么联系"), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryRecallHit(
                        "fact-user-1",
                        "Hermes 会话记忆：发布时间",
                        "你之前在 Hermes 会话里提到 Paris 和 Berlin 需要一起评估发布时间。",
                        0.92d
                )));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:wiki:project:12"), any(), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-wiki-1",
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
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:memory:shared"), any(), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryWorldFact(
                        "fact-shared-1",
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

        String markdown = service.buildMemoryContextMarkdown(currentUser, context, request);

        assertThat(markdown)
                .contains("你之前在 Hermes 会话里提到 Paris 和 Berlin 需要一起评估发布时间。")
                .contains("来源：用户会话记忆")
                .contains("来源：项目 Wiki");
        verify(hindsightClientService).recallMemories("git-ai-club:hermes:user:5", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
        verify(hindsightClientService).recallWorldFacts("git-ai-club:wiki:project:12", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
        verify(hindsightClientService).recallWorldFacts("git-ai-club:memory:shared", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
    }

    @Test
    void shouldRetainConversationTurnIntoUserScopedBank() {
        HermesHindsightMemoryService service = new HermesHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        CurrentUserInfo currentUser = currentUser();
        HermesConversationSessionEntity session = new HermesConversationSessionEntity();
        session.setId(10L);
        session.setClientConversationId("conversation-1");
        session.setRouteName("project-iterations");
        session.setProjectId(12L);
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        HermesChatRequest request = new HermesChatRequest(
                "这个项目当前最大的阻塞是什么",
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
        HermesConversationState finalState = new HermesConversationState(
                "scope-key",
                "conversation-1",
                currentUser,
                null,
                null,
                "session-token",
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                null,
                List.of(),
                ""
        );

        service.retainConversationTurnAsync(
                currentUser,
                session,
                context,
                request,
                "当前最大的阻塞是发布时间没有对齐。",
                finalState
        );

        ArgumentCaptor<String> documentIdCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<List<String>> tagsCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Map<String, Object>> metadataCaptor = ArgumentCaptor.forClass(Map.class);
        verify(hindsightClientService).retainHermesConversationMemory(
                eq(5L),
                documentIdCaptor.capture(),
                eq("Hermes 会话记忆：这个项目当前最大的阻塞是什么"),
                any(),
                tagsCaptor.capture(),
                metadataCaptor.capture()
        );
        assertThat(documentIdCaptor.getValue()).isEqualTo("hermes-conversation:conversation-1:turn:1");
        assertThat(tagsCaptor.getValue()).contains("hermes", "source:hermes", "user:5", "project:12", "route:project-iterations");
        assertThat(metadataCaptor.getValue()).containsEntry("userId", 5L);
        assertThat(metadataCaptor.getValue()).containsEntry("memoryType", "conversation_turn");
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                5L,
                "pm-user",
                "项目经理",
                "",
                "",
                "",
                "",
                true,
                List.of("PM"),
                List.of("项目经理"),
                List.of("hermes:chat")
        );
    }
}
