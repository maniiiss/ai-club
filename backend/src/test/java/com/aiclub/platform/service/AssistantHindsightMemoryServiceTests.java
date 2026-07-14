package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantMemoryConsolidationStatus;
import com.aiclub.platform.dto.AssistantMemoryOverview;
import com.aiclub.platform.dto.AssistantMemoryConsolidationTask;
import com.aiclub.platform.dto.AssistantReferenceSummary;
import com.aiclub.platform.dto.AssistantUserMemoryItem;
import com.aiclub.platform.dto.request.AssistantChatRequest;
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
 * 验证 Assistant 的 Hindsight 用户记忆召回与写入都按用户隔离执行，
 * 同时不再把 Wiki 知识召回混进会话记忆链路。
 */
@ExtendWith(MockitoExtension.class)
class AssistantHindsightMemoryServiceTests {

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private HindsightMemoryFallbackService hindsightMemoryFallbackService;

    @Mock
    private WikiSpaceService wikiSpaceService;

    @Test
    void shouldRecallUserBankBeforeSharedBanks() {
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
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                properties,
                wikiSpaceService
        );

        CurrentUserInfo currentUser = currentUser();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
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

        when(hindsightClientService.recallMemories(eq("git-ai-club:hermes:user:5"), eq("巴黎和柏林最近在项目知识里有什么联系"), eq(List.of("project:12")), eq(3)))
                .thenReturn(List.of(new HindsightClientService.MemoryRecallHit(
                        "fact-user-1",
                        "Assistant 会话记忆：发布时间",
                        "你之前在 Assistant 会话里提到 Paris 和 Berlin 需要一起评估发布时间。",
                        0.92d
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
                .contains("你之前在 Assistant 会话里提到 Paris 和 Berlin 需要一起评估发布时间。")
                .contains("来源：用户会话记忆")
                .contains("来源：共享记忆")
                .doesNotContain("来源：项目 Wiki");
        verify(hindsightClientService).recallMemories("git-ai-club:hermes:user:5", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
        verify(hindsightClientService).recallWorldFacts("git-ai-club:memory:shared", "巴黎和柏林最近在项目知识里有什么联系", List.of("project:12"), 3);
    }

    @Test
    void shouldRetainConversationTurnIntoUserScopedBank() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        CurrentUserInfo currentUser = currentUser();
        AssistantConversationSessionEntity session = new AssistantConversationSessionEntity();
        session.setId(10L);
        session.setClientConversationId("conversation-1");
        session.setRouteName("project-iterations");
        session.setProjectId(12L);
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        AssistantChatRequest request = new AssistantChatRequest(
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
        AssistantConversationState finalState = new AssistantConversationState(
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
        verify(hindsightClientService).retainAssistantConversationMemory(
                eq(5L),
                documentIdCaptor.capture(),
                eq("GitPilot 会话记忆：这个项目当前最大的阻塞是什么"),
                any(),
                tagsCaptor.capture(),
                metadataCaptor.capture()
        );
        assertThat(documentIdCaptor.getValue()).isEqualTo("hermes-conversation:conversation-1:turn:1");
        assertThat(tagsCaptor.getValue()).contains("hermes", "source:hermes", "user:5", "project:12", "route:project-iterations");
        assertThat(metadataCaptor.getValue()).containsEntry("userId", 5L);
        assertThat(metadataCaptor.getValue()).containsEntry("memoryType", "conversation_turn");
    }

    @Test
    void shouldListUserMemoriesFromHindsightRecall() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );
        CurrentUserInfo currentUser = currentUser();

        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(false);
        when(hindsightClientService.recallMemories(eq("git-ai-club:hermes:user:5"), eq("test"), eq(List.of()), eq(50)))
                .thenReturn(List.of(new HindsightClientService.MemoryRecallHit(
                        "hermes-conversation:c1:turn:1",
                        "Assistant 会话记忆：测试",
                        "这是测试记忆内容",
                        0.95d
                )));

        List<AssistantUserMemoryItem> items = service.listUserMemories(currentUser, "test", 50);

        assertThat(items).hasSize(1);
        assertThat(items.get(0).documentId()).isEqualTo("hermes-conversation:c1:turn:1");
        assertThat(items.get(0).snippet()).isEqualTo("这是测试记忆内容");
    }

    @Test
    void shouldDeleteUserMemoryByDocumentId() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );
        CurrentUserInfo currentUser = currentUser();

        service.deleteUserMemory(currentUser, "hermes-conversation:c1:turn:1");

        verify(hindsightClientService).deleteDocument("git-ai-club:hermes:user:5", "hermes-conversation:c1:turn:1");
    }

    @Test
    void shouldRejectDeleteWhenDocumentIdNotAssistantPrefix() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );
        CurrentUserInfo currentUser = currentUser();

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> service.deleteUserMemory(currentUser, "wiki-space-page-15")
        );
    }

    @Test
    void shouldClearAllUserMemories() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );
        CurrentUserInfo currentUser = currentUser();

        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(false);
        when(hindsightClientService.recallMemories(eq("git-ai-club:hermes:user:5"), eq(""), eq(List.of()), eq(200)))
                .thenReturn(List.of(
                        new HindsightClientService.MemoryRecallHit("hermes-conversation:c1:turn:1", "title1", "snippet1", 0.9d),
                        new HindsightClientService.MemoryRecallHit("hermes-conversation:c1:turn:2", "title2", "snippet2", 0.8d)
                ));

        int deleted = service.clearUserMemories(currentUser);

        assertThat(deleted).isEqualTo(2);
        verify(hindsightClientService).deleteDocument("git-ai-club:hermes:user:5", "hermes-conversation:c1:turn:1");
        verify(hindsightClientService).deleteDocument("git-ai-club:hermes:user:5", "hermes-conversation:c1:turn:2");
    }

    @Test
    void shouldStartUserMemoryConsolidationAndReturnOperationId() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        when(hindsightClientService.startBankConsolidation("git-ai-club:hermes:user:5"))
                .thenReturn(new HindsightClientService.MemoryConsolidationTask("operation-123", false));

        AssistantMemoryConsolidationTask task = service.startUserMemoryConsolidation(currentUser());

        assertThat(task.operationId()).isEqualTo("operation-123");
        assertThat(task.deduplicated()).isFalse();
    }

    @Test
    void shouldQueryUserMemoryConsolidationStatus() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        when(hindsightClientService.getBankOperationStatus("git-ai-club:hermes:user:5", "operation-123"))
                .thenReturn(new HindsightClientService.AsyncOperationStatus(
                        "operation-123",
                        "consolidate_memories",
                        "processing",
                        "",
                        0,
                        "",
                        "2026-05-31T10:00:00Z",
                        "2026-05-31T10:00:05Z",
                        ""
                ));

        AssistantMemoryConsolidationStatus status = service.getUserMemoryConsolidationStatus(currentUser(), "operation-123");

        assertThat(status.operationId()).isEqualTo("operation-123");
        assertThat(status.operationType()).isEqualTo("consolidate_memories");
        assertThat(status.status()).isEqualTo("processing");
    }

    @Test
    void shouldSeparateConversationMemoriesAndConsolidatedFactsInOverview() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(false);
        when(hindsightClientService.recallMemories(eq("git-ai-club:hermes:user:5"), eq(""), eq(List.of()), eq(50)))
                .thenReturn(List.of(new HindsightClientService.MemoryRecallHit(
                        "hermes-conversation:c1:turn:1",
                        "Assistant 会话记忆：测试",
                        "用户：项目经理\n场景：项目 #12\n路由：project-iterations\n\n用户问题：\n发布时间是什么\n\n助手回答：\n下周二发布",
                        0.95d
                )));
        when(hindsightClientService.recallWorldFacts(eq("git-ai-club:hermes:user:5"), eq(""), eq(List.of()), eq(50)))
                .thenReturn(List.of(
                        new HindsightClientService.MemoryWorldFact(
                                "fact-1",
                                "world",
                                "发布时间",
                                "结论",
                                "下周二",
                                "当前项目的发布时间已经收敛为下周二。",
                                0.88d,
                                "HINDSIGHT_RECALL",
                                "2026-05-31T08:00:00Z",
                                List.of("project:12"),
                                Map.of("documentId", "memory-fact:1")
                        ),
                        new HindsightClientService.MemoryWorldFact(
                                "fact-2",
                                "world",
                                "",
                                "",
                                "",
                                "用户：项目经理\n场景：项目 #12\n路由：project-iterations\n\n用户问题：\n发布时间是什么\n\n助手回答：\n下周二发布",
                                0.88d,
                                "HINDSIGHT_RECALL",
                                "2026-05-31T08:00:00Z",
                                List.of("project:12"),
                                Map.of("documentId", "hermes-conversation:c1:turn:1")
                        )
                ));

        AssistantMemoryOverview overview = service.getUserMemoryOverview(currentUser(), "", 50);

        assertThat(overview.conversationMemories()).hasSize(1);
        assertThat(overview.consolidatedFacts()).hasSize(1);
        assertThat(overview.consolidatedFacts().get(0).summary()).contains("发布时间已经收敛为下周二");
    }

    @Test
    void shouldFilterConsolidatedFactsOutOfConversationMemoryListWhenFallbackEnabled() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(true);
        when(hindsightMemoryFallbackService.searchFacts(eq(List.of("git-ai-club:hermes:user:5")), eq(""), eq(50)))
                .thenReturn(List.of(
                        new HindsightClientService.MemoryWorldFact(
                                "hermes-conversation:c1:turn:1",
                                "world",
                                "",
                                "",
                                "",
                                "用户：项目经理\n场景：项目 #12\n路由：project-iterations\n\n用户问题：\n发布时间是什么\n\n助手回答：\n下周二发布",
                                null,
                                "HINDSIGHT_RECALL",
                                "2026-05-31T08:00:00Z",
                                List.of("project:12"),
                                Map.of("documentId", "hermes-conversation:c1:turn:1")
                        ),
                        new HindsightClientService.MemoryWorldFact(
                                "fact-1",
                                "world",
                                "发布时间",
                                "结论",
                                "下周二",
                                "当前项目的发布时间已经收敛为下周二。",
                                null,
                                "HINDSIGHT_RECALL",
                                "2026-05-31T08:10:00Z",
                                List.of("project:12"),
                                Map.of("documentId", "memory-fact:1")
                        )
                ));

        List<AssistantUserMemoryItem> items = service.listUserMemories(currentUser(), "", 50);

        assertThat(items).hasSize(1);
        assertThat(items.get(0).documentId()).isEqualTo("hermes-conversation:c1:turn:1");
    }

    @Test
    void shouldRestoreQuestionAnswerAndDocumentIdFromFallbackMetadata() {
        AssistantHindsightMemoryService service = new AssistantHindsightMemoryService(
                hindsightClientService,
                hindsightMemoryFallbackService,
                new HindsightProperties("http://localhost:18888", "", "git-ai-club", "mid", 30),
                wikiSpaceService
        );

        when(hindsightMemoryFallbackService.isEnabled()).thenReturn(true);
        when(hindsightMemoryFallbackService.searchFacts(eq(List.of("git-ai-club:hermes:user:5")), eq(""), eq(50)))
                .thenReturn(List.of(
                        new HindsightClientService.MemoryWorldFact(
                                "memory-unit-uuid-1",
                                "world",
                                "",
                                "",
                                "",
                                "发布时间已经确定。",
                                null,
                                "HINDSIGHT_RECALL",
                                "2026-05-31T08:00:00Z",
                                List.of("project:12"),
                                Map.of(
                                        "documentId", "hermes-conversation:c1:turn:3",
                                        "question", "发布时间是什么",
                                        "assistantSummary", "下周二发布"
                                )
                        )
                ));

        List<AssistantUserMemoryItem> items = service.listUserMemories(currentUser(), "", 50);

        assertThat(items).hasSize(1);
        assertThat(items.get(0).documentId()).isEqualTo("hermes-conversation:c1:turn:3");
        assertThat(items.get(0).question()).isEqualTo("发布时间是什么");
        assertThat(items.get(0).answer()).isEqualTo("下周二发布");
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
                List.of("hermes:chat"),
                List.of()
        );
    }
}
