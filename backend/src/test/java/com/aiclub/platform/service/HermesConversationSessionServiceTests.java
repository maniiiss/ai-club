package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesConversationMessageEntity;
import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationSessionSummary;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesDebugInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.CreateHermesConversationSessionRequest;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.RenameHermesConversationSessionRequest;
import com.aiclub.platform.repository.HermesConversationMessageRepository;
import com.aiclub.platform.repository.HermesConversationSessionRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 云端会话记录服务的创建、管理与消息持久化行为。
 */
@ExtendWith(MockitoExtension.class)
class HermesConversationSessionServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private HermesConversationSessionRepository hermesConversationSessionRepository;

    @Mock
    private HermesConversationMessageRepository hermesConversationMessageRepository;

    /**
     * 新建会话时应生成稳定的 clientConversationId，并固化当前页面上下文。
     */
    @Test
    void shouldCreateSessionWithStableClientConversationId() {
        HermesConversationSessionService service = new HermesConversationSessionService(
                authService,
                userRepository,
                hermesConversationSessionRepository,
                hermesConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesConversationSessionRepository.save(any(HermesConversationSessionEntity.class)))
                .thenAnswer(invocation -> {
                    HermesConversationSessionEntity entity = invocation.getArgument(0);
                    entity.setId(11L);
                    return entity;
                });

        HermesConversationSessionSummary summary = service.createSession(new CreateHermesConversationSessionRequest(
                "project-iterations",
                12L,
                101L,
                7L,
                null
        ));

        ArgumentCaptor<HermesConversationSessionEntity> captor = ArgumentCaptor.forClass(HermesConversationSessionEntity.class);
        verify(hermesConversationSessionRepository).save(captor.capture());
        HermesConversationSessionEntity saved = captor.getValue();

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
        HermesConversationSessionService service = new HermesConversationSessionService(
                authService,
                userRepository,
                hermesConversationSessionRepository,
                hermesConversationMessageRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        HermesConversationSessionEntity session = buildSessionEntity();
        session.setCreatedAt(LocalDateTime.of(2026, 4, 14, 10, 0));
        session.setUpdatedAt(LocalDateTime.of(2026, 4, 14, 10, 5));
        session.setLastMessageAt(LocalDateTime.of(2026, 4, 14, 10, 6));

        when(authService.currentUser()).thenReturn(currentUser);
        when(hermesConversationSessionRepository.findByUser_IdAndArchived(eq(5L), eq(false), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(session), PageRequest.of(0, 20), 1));
        when(hermesConversationSessionRepository.findByIdAndUser_Id(10L, 5L)).thenReturn(Optional.of(session));
        when(hermesConversationSessionRepository.save(any(HermesConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        PageResponse<HermesConversationSessionSummary> pageResponse = service.pageSessions(1, 20, false);
        HermesConversationSessionSummary renamed = service.renameSession(10L, new RenameHermesConversationSessionRequest("支付项目阻塞分析"));
        HermesConversationSessionSummary archived = service.archiveSession(10L);
        LocalDateTime archivedAt = session.getArchivedAt();
        HermesConversationSessionSummary restored = service.restoreSession(10L);
        service.deleteSession(10L);

        assertThat(pageResponse.records()).hasSize(1);
        assertThat(pageResponse.records().get(0).id()).isEqualTo(10L);
        assertThat(renamed.title()).isEqualTo("支付项目阻塞分析");
        assertThat(session.isTitleCustomized()).isTrue();
        assertThat(archived.archived()).isTrue();
        assertThat(archivedAt).isNotNull();
        assertThat(restored.archived()).isFalse();
        assertThat(session.getArchivedAt()).isNull();
        verify(hermesConversationSessionRepository).delete(session);
    }

    /**
     * 成功和失败回答都应把消息写入数据库，并刷新会话预览与展示态。
     */
    @Test
    void shouldPersistMessagesForSuccessAndFailureResponses() {
        HermesConversationSessionService service = new HermesConversationSessionService(
                authService,
                userRepository,
                hermesConversationSessionRepository,
                hermesConversationMessageRepository,
                new ObjectMapper()
        );

        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of("这个项目当前最大的阻塞是什么"),
                "项目上下文"
        );
        HermesConversationState conversationState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                buildCurrentUser(),
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot("这个项目当前最大的阻塞是什么", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                HermesGroundingState.empty(),
                List.of(),
                ""
        );
        HermesDebugInfo debugInfo = new HermesDebugInfo(
                "hermes-agent",
                "API_SERVER",
                0,
                List.of(),
                java.util.Map.of(),
                java.util.Map.of(),
                List.of(),
                ""
        );

        when(hermesConversationMessageRepository.save(any(HermesConversationMessageEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesConversationSessionRepository.save(any(HermesConversationSessionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesConversationMessageRepository.findBySession_IdOrderByCreatedAtAscIdAsc(10L))
                .thenReturn(List.of());

        service.recordSuccess(
                session,
                new HermesChatRequest("这个项目当前最大的阻塞是什么", "project-iterations", 12L, null, null, null, "conversation-1", null, null),
                conversationState,
                "完整回答内容",
                debugInfo
        );
        service.recordFailure(
                session,
                new HermesChatRequest("继续分析当前问题", "project-iterations", 12L, null, null, null, "conversation-1", null, null),
                conversationState,
                "Hermes 助手暂时不可用",
                debugInfo
        );

        ArgumentCaptor<HermesConversationMessageEntity> messageCaptor = ArgumentCaptor.forClass(HermesConversationMessageEntity.class);
        verify(hermesConversationMessageRepository, atLeastOnce()).save(messageCaptor.capture());
        List<HermesConversationMessageEntity> persistedMessages = messageCaptor.getAllValues();

        assertThat(persistedMessages).hasSize(4);
        assertThat(persistedMessages.get(0).getRole()).isEqualTo("user");
        assertThat(persistedMessages.get(1).getRole()).isEqualTo("assistant");
        assertThat(persistedMessages.get(1).getStatus()).isEqualTo("DONE");
        assertThat(persistedMessages.get(2).getRole()).isEqualTo("user");
        assertThat(persistedMessages.get(3).getStatus()).isEqualTo("ERROR");
        assertThat(session.getTitle()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(session.getLatestPreview()).isEqualTo("Hermes 助手暂时不可用");
        assertThat(session.getLatestDisplayStateJson()).doesNotContain("完整回答内容");
        assertThat(session.getLatestDisplayStateJson()).contains("references");
    }

    private HermesConversationSessionEntity buildSessionEntity() {
        HermesConversationSessionEntity entity = new HermesConversationSessionEntity();
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
                List.of("hermes:chat")
        );
    }
}
