package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationContextSnapshot;
import com.aiclub.platform.dto.AssistantConversationRequestSnapshot;
import com.aiclub.platform.dto.AssistantConversationSessionSummary;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantDebugInfo;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantReferenceSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateAssistantConversationSessionRequest;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.RenameAssistantConversationSessionRequest;
import com.aiclub.platform.repository.AssistantConversationMessageRepository;
import com.aiclub.platform.repository.AssistantConversationSessionRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Assistant 云端会话记录服务的创建、管理与消息持久化行为。
 */
@ExtendWith(MockitoExtension.class)
class AssistantConversationSessionServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AssistantConversationSessionRepository assistantConversationSessionRepository;

    @Mock
    private AssistantConversationMessageRepository assistantConversationMessageRepository;

    @Mock
    private AssistantMcpServerService assistantMcpServerService;

    /**
     * 新建会话时应生成稳定的 clientConversationId，并固化当前页面上下文。
     */
    @Test
    void shouldCreateSessionWithStableClientConversationId() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantConversationSessionRepository.save(any(AssistantConversationSessionEntity.class)))
                .thenAnswer(invocation -> {
                    AssistantConversationSessionEntity entity = invocation.getArgument(0);
                    entity.setId(11L);
                    return entity;
                });

        AssistantConversationSessionSummary summary = service.createSession(new CreateAssistantConversationSessionRequest(
                "project-iterations",
                12L,
                101L,
                7L,
                null
        ));

        ArgumentCaptor<AssistantConversationSessionEntity> captor = ArgumentCaptor.forClass(AssistantConversationSessionEntity.class);
        verify(assistantConversationSessionRepository).save(captor.capture());
        AssistantConversationSessionEntity saved = captor.getValue();

        assertThat(saved.getTitle()).isEqualTo("新会话");
        assertThat(saved.getClientConversationId()).startsWith("conversation-");
        assertThat(saved.getRouteName()).isEqualTo("project-iterations");
        assertThat(saved.getProjectId()).isEqualTo(12L);
        assertThat(saved.getTaskId()).isEqualTo(101L);
        assertThat(saved.getIterationId()).isEqualTo(7L);
        assertThat(summary.id()).isEqualTo(11L);
    }

    /**
     * 会话列表应始终按当前用户与归档状态隔离，重命名/归档/恢复会直接作用在当前用户会话上。
     */
    @Test
    void shouldPageAndManageOwnedSessions() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        AssistantConversationSessionEntity session = buildSessionEntity();
        session.setCreatedAt(LocalDateTime.of(2026, 4, 14, 10, 0));
        session.setUpdatedAt(LocalDateTime.of(2026, 4, 14, 10, 5));
        session.setLastMessageAt(LocalDateTime.of(2026, 4, 14, 10, 6));

        when(authService.currentUser()).thenReturn(currentUser);
        when(assistantConversationSessionRepository.findByUser_IdAndArchived(eq(5L), eq(false), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(session), PageRequest.of(0, 20), 1));
        when(assistantConversationSessionRepository.findByIdAndUser_Id(10L, 5L)).thenReturn(Optional.of(session));
        when(assistantConversationSessionRepository.save(any(AssistantConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PageResponse<AssistantConversationSessionSummary> pageResponse = service.pageSessions(1, 20, false);
        AssistantConversationSessionSummary renamed = service.renameSession(10L, new RenameAssistantConversationSessionRequest("支付项目阻塞分析"));
        AssistantConversationSessionSummary archived = service.archiveSession(10L);
        LocalDateTime archivedAt = session.getArchivedAt();
        AssistantConversationSessionSummary restored = service.restoreSession(10L);
        service.deleteSession(10L);

        assertThat(pageResponse.records()).hasSize(1);
        assertThat(pageResponse.records().get(0).id()).isEqualTo(10L);
        assertThat(renamed.title()).isEqualTo("支付项目阻塞分析");
        assertThat(session.isTitleCustomized()).isTrue();
        assertThat(archived.archived()).isTrue();
        assertThat(archivedAt).isNotNull();
        assertThat(restored.archived()).isFalse();
        assertThat(session.getArchivedAt()).isNull();
        verify(assistantConversationSessionRepository).delete(session);
    }

    @Test
    void shouldFormatStoredAssistantMarkdownWhenLoadingConversationDetail() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantConversationMessageEntity assistantMessage = new AssistantConversationMessageEntity();
        assistantMessage.setId(44L);
        assistantMessage.setRole("assistant");
        assistantMessage.setStatus("DONE");
        assistantMessage.setContent("- **目标迭代：**20260429（ID:1）\n\n1.进入缺陷详情页2.在迭代字段中选择 20260429");

        when(authService.currentUser()).thenReturn(buildCurrentUser());
        when(assistantConversationSessionRepository.findByIdAndUser_Id(10L, 5L)).thenReturn(Optional.of(session));
        when(assistantConversationMessageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(10L))
                .thenReturn(List.of(assistantMessage));

        var detail = service.getSessionDetail(10L);

        assertThat(detail.messages().get(0).content())
                .contains("**目标迭代：** 20260429")
                .contains("1. 进入缺陷详情页\n2. 在迭代字段中选择 20260429");
    }

    /**
     * 公众端纯聊天页只应读取没有任何项目/任务/Wiki 绑定的全局会话，避免把项目助手会话混进纯聊天历史。
     */
    @Test
    void shouldPageGlobalSessionsWithoutBoundContext() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        AssistantConversationSessionEntity globalSession = buildSessionEntity();
        globalSession.setProjectId(null);
        globalSession.setTaskId(null);
        globalSession.setIterationId(null);
        globalSession.setPlanId(null);
        globalSession.setWikiSpaceId(null);
        globalSession.setWikiPageId(null);
        globalSession.setRouteName("public-hermes-chat");

        when(authService.currentUser()).thenReturn(currentUser);
        when(assistantConversationSessionRepository.findGlobalSessions(eq(5L), eq(false), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(globalSession), PageRequest.of(0, 20), 1));

        PageResponse<AssistantConversationSessionSummary> pageResponse =
                service.pageSessions(1, 20, false, "GLOBAL", null);

        assertThat(pageResponse.records()).hasSize(1);
        assertThat(pageResponse.records().get(0).routeName()).isEqualTo("public-hermes-chat");
        assertThat(pageResponse.records().get(0).projectId()).isNull();
        verify(assistantConversationSessionRepository).findGlobalSessions(eq(5L), eq(false), any(PageRequest.class));
    }

    /**
     * 项目浮标只读取当前项目的 Assistant 会话，避免不同项目之间的历史互相串扰。
     */
    @Test
    void shouldPageProjectSessionsByProjectId() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        AssistantConversationSessionEntity projectSession = buildSessionEntity();
        projectSession.setProjectId(12L);

        when(authService.currentUser()).thenReturn(currentUser);
        when(assistantConversationSessionRepository.findByUser_IdAndArchivedAndProjectId(
                eq(5L),
                eq(false),
                eq(12L),
                any(PageRequest.class)
        )).thenReturn(new PageImpl<>(List.of(projectSession), PageRequest.of(0, 20), 1));

        PageResponse<AssistantConversationSessionSummary> pageResponse =
                service.pageSessions(1, 20, false, "PROJECT", 12L);

        assertThat(pageResponse.records()).hasSize(1);
        assertThat(pageResponse.records().get(0).projectId()).isEqualTo(12L);
        verify(assistantConversationSessionRepository).findByUser_IdAndArchivedAndProjectId(
                eq(5L),
                eq(false),
                eq(12L),
                any(PageRequest.class)
        );
    }

    /**
     * 项目聊天搜索应返回消息命中摘要，并把归档会话纳入同一用户项目范围。
     */
    @Test
    void shouldSearchProjectSessionsByMessageContent() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        AssistantConversationSessionEntity session = buildSessionEntity();
        session.setProjectId(12L);
        session.setArchived(true);
        AssistantConversationMessageEntity message = new AssistantConversationMessageEntity();
        message.setId(44L);
        message.setSession(session);
        message.setRole("assistant");
        message.setContent("当前项目的发布阻塞点是接口联调");
        message.setCreatedAt(LocalDateTime.of(2026, 4, 14, 11, 0));

        when(authService.currentUser()).thenReturn(buildCurrentUser());
        when(assistantConversationSessionRepository.searchProjectSessions(
                eq(5L), eq(12L), eq("联调"), eq(true), any(PageRequest.class)
        )).thenReturn(new PageImpl<>(List.of(session), PageRequest.of(0, 20), 1));
        when(assistantConversationMessageRepository.findMatchingMessages(eq(10L), eq("联调"), any(PageRequest.class)))
                .thenReturn(List.of(message));

        PageResponse<com.aiclub.platform.dto.AssistantConversationSearchResult> result = service.searchProjectSessions(
                1, 20, 12L, "联调", true
        );

        assertThat(result.records()).hasSize(1);
        assertThat(result.records().get(0).sessionId()).isEqualTo(10L);
        assertThat(result.records().get(0).archived()).isTrue();
        assertThat(result.records().get(0).matchedRole()).isEqualTo("assistant");
        assertThat(result.records().get(0).matchedContent()).contains("发布阻塞点");
    }

    /**
     * 空会话复用必须按完整上下文隔离，避免纯聊天页新建的空会话被项目页浮标抢走。
     */
    @Test
    void shouldReuseOnlyEmptySessionWithSameContext() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity existingProjectSession = buildSessionEntity();
        existingProjectSession.setRouteName("projects");
        existingProjectSession.setProjectId(12L);
        existingProjectSession.setTaskId(null);
        existingProjectSession.setIterationId(null);
        existingProjectSession.setPlanId(null);
        existingProjectSession.setWikiSpaceId(null);
        existingProjectSession.setWikiPageId(null);

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantConversationSessionRepository.findUnusedSessionByContext(
                nullable(Long.class),
                nullable(String.class),
                nullable(Long.class),
                nullable(Long.class),
                nullable(Long.class),
                nullable(Long.class),
                nullable(Long.class),
                nullable(Long.class)
        ))
                .thenReturn(List.of(existingProjectSession));

        AssistantConversationSessionSummary reused = service.createSession(new CreateAssistantConversationSessionRequest(
                "projects",
                12L,
                null,
                null,
                null,
                null,
                null
        ));

        assertThat(reused.id()).isEqualTo(10L);
        assertThat(reused.routeName()).isEqualTo("projects");
        assertThat(reused.projectId()).isEqualTo(12L);
        ArgumentCaptor<Long> userIdCaptor = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<String> routeNameCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Long> projectIdCaptor = ArgumentCaptor.forClass(Long.class);
        verify(assistantConversationSessionRepository).findUnusedSessionByContext(
                userIdCaptor.capture(),
                routeNameCaptor.capture(),
                projectIdCaptor.capture(),
                isNull(),
                isNull(),
                isNull(),
                isNull(),
                isNull()
        );
        assertThat(userIdCaptor.getValue()).isEqualTo(5L);
        assertThat(routeNameCaptor.getValue()).isEqualTo("projects");
        assertThat(projectIdCaptor.getValue()).isEqualTo(12L);
    }

    /** 空会话被复用时，应重新固化最新的个人 MCP 配置，避免工具目录停留在旧快照。 */
    @Test
    void shouldRefreshMcpSnapshotWhenReusingEmptySession() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );
        ReflectionTestUtils.setField(service, "assistantMcpServerService", assistantMcpServerService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity emptySession = buildSessionEntity();
        emptySession.setExternalMcpSnapshotCiphertext("");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantConversationSessionRepository.findUnusedSessionByContext(
                any(), any(), any(), any(), any(), any(), any(), any()
        )).thenReturn(List.of(emptySession));
        when(assistantMcpServerService.snapshotForNewSession(5L)).thenReturn("latest-mcp-snapshot");
        when(assistantConversationSessionRepository.save(any(AssistantConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        service.createSession(new CreateAssistantConversationSessionRequest(
                "projects", 12L, null, null, null, null, null
        ));

        assertThat(emptySession.getExternalMcpSnapshotCiphertext()).isEqualTo("latest-mcp-snapshot");
        verify(assistantMcpServerService).snapshotForNewSession(5L);
        verify(assistantConversationSessionRepository).save(emptySession);
    }

    /**
     * 成功和失败回答都应把消息写入数据库，并刷新会话预览与展示态。
     */
    @Test
    void shouldPersistMessagesForSuccessAndFailureResponses() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of("这个项目当前最大的阻塞是什么"),
                "项目上下文"
        );
        AssistantConversationState conversationState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                buildCurrentUser(),
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot("这个项目当前最大的阻塞是什么", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                AssistantGroundingState.empty(),
                List.of(),
                ""
        );
        AssistantDebugInfo debugInfo = new AssistantDebugInfo(
                "hermes-agent",
                "API_SERVER",
                0,
                List.of(),
                java.util.Map.of(),
                java.util.Map.of(),
                List.of(),
                ""
        );

        when(assistantConversationMessageRepository.save(any(AssistantConversationMessageEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantConversationSessionRepository.save(any(AssistantConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantConversationMessageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(10L))
                .thenReturn(List.of());

        service.recordSuccess(
                session,
                new AssistantChatRequest("这个项目当前最大的阻塞是什么", "project-iterations", 12L, null, null, null, "conversation-1", null, null),
                conversationState,
                "完整回答内容",
                debugInfo
        );
        service.recordFailure(
                session,
                new AssistantChatRequest("继续分析当前问题", "project-iterations", 12L, null, null, null, "conversation-1", null, null),
                conversationState,
                "Assistant 助手暂时不可用",
                debugInfo
        );

        ArgumentCaptor<AssistantConversationMessageEntity> messageCaptor = ArgumentCaptor.forClass(AssistantConversationMessageEntity.class);
        verify(assistantConversationMessageRepository, atLeastOnce()).save(messageCaptor.capture());
        List<AssistantConversationMessageEntity> persistedMessages = messageCaptor.getAllValues();

        assertThat(persistedMessages).hasSize(4);
        assertThat(persistedMessages.get(0).getRole()).isEqualTo("user");
        assertThat(persistedMessages.get(1).getRole()).isEqualTo("assistant");
        assertThat(persistedMessages.get(1).getStatus()).isEqualTo("DONE");
        assertThat(persistedMessages.get(2).getRole()).isEqualTo("user");
        assertThat(persistedMessages.get(3).getStatus()).isEqualTo("ERROR");
        assertThat(session.getTitle()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(session.getLatestPreview()).isEqualTo("Assistant 助手暂时不可用");
        assertThat(session.getLatestDisplayStateJson()).doesNotContain("完整回答内容");
        assertThat(session.getLatestDisplayStateJson()).contains("references");
        assertThat(session.getLatestDisplayStateJson()).doesNotContain("debug");
    }

    private AssistantConversationSessionEntity buildSessionEntity() {
        AssistantConversationSessionEntity entity = new AssistantConversationSessionEntity();
        entity.setId(10L);
        entity.setTitle("新会话");
        entity.setTitleCustomized(false);
        entity.setClientConversationId("conversation-1");
        entity.setRouteName("project-iterations");
        entity.setProjectId(12L);
        entity.setLatestPreview("");
        entity.setLatestDisplayStateJson("{}");
        entity.setArchived(false);
        return entity;
    }

    /**
     * 标记动作已执行后应把 key 累积保存，并在详情中回显，从而让前端刷新后仍能识别已执行状态；
     * 同一 key 重复上报需要去重，避免持久化字段无限增长。
     */
    @Test
    void shouldAccumulateAndExposeExecutedActionKeys() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        AssistantConversationSessionEntity session = buildSessionEntity();
        session.setExecutedActionKeysJson("[]");

        when(authService.currentUser()).thenReturn(currentUser);
        when(assistantConversationSessionRepository.findByIdAndUser_Id(10L, 5L)).thenReturn(Optional.of(session));
        when(assistantConversationSessionRepository.save(any(AssistantConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(assistantConversationMessageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(10L))
                .thenReturn(List.of());

        service.markActionExecuted(10L, "CREATE_EXECUTION_TASK:0:scan|abc123");
        service.markActionExecuted(10L, "CREATE_WORK_ITEM_DRAFT:1:draft|def456");
        // 重复上报应被去重，不再触发新的保存写入
        com.aiclub.platform.dto.AssistantConversationDetail detail =
                service.markActionExecuted(10L, "CREATE_EXECUTION_TASK:0:scan|abc123");

        assertThat(session.getExecutedActionKeysJson())
                .contains("CREATE_EXECUTION_TASK:0:scan|abc123")
                .contains("CREATE_WORK_ITEM_DRAFT:1:draft|def456");
        assertThat(detail.executedActionKeys())
                .containsExactly("CREATE_EXECUTION_TASK:0:scan|abc123", "CREATE_WORK_ITEM_DRAFT:1:draft|def456");
        // 第三次重复上报不应再 save
        verify(assistantConversationSessionRepository, org.mockito.Mockito.times(2)).save(any(AssistantConversationSessionEntity.class));
    }

    /**
     * 上报的动作 key 不能为空，避免脏数据写入。
     */
    @Test
    void shouldRejectBlankActionKey() {
        AssistantConversationSessionService service = new AssistantConversationSessionService(
                authService,
                userRepository,
                assistantConversationSessionRepository,
                assistantConversationMessageRepository,
                new ObjectMapper()
        );

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.markActionExecuted(10L, "  "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("动作标识");
    }

    private CurrentUserInfo buildCurrentUser() {
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
