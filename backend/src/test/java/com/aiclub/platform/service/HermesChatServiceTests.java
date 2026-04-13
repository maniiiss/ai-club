package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesSelectionRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证新版 Hermes 会话代理链路仍能稳定生成范围键、会话态和 selection 恢复消息。
 */
@ExtendWith(MockitoExtension.class)
class HermesChatServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private HermesContextAssembler hermesContextAssembler;

    @Mock
    private HermesPromptBuilder hermesPromptBuilder;

    @Mock
    private HermesGatewayService hermesGatewayService;

    @Mock
    private HermesToolOrchestrator hermesToolOrchestrator;

    @Mock
    private HermesActionFallbackService hermesActionFallbackService;

    @Mock
    private HermesConversationStateStore hermesConversationStateStore;

    @Mock
    private HermesMcpSessionTokenService hermesMcpSessionTokenService;

    @Mock
    private HermesChatAuditRepository hermesChatAuditRepository;

    /**
     * 普通项目会话应生成带会话后缀的 scopeKey，并在回答后把 transcript 写回会话态。
     */
    @Test
    void shouldUseProjectScopedSessionKeyAndPersistConversationState() {
        HermesChatService hermesChatService = new HermesChatService(
                authService,
                userRepository,
                new HermesProperties(
                        "http://localhost:18080/v1",
                        "",
                        "hermes-agent",
                        60,
                        "test:hermes",
                        4,
                        86400
                ),
                hermesContextAssembler,
                hermesPromptBuilder,
                hermesGatewayService,
                hermesToolOrchestrator,
                hermesActionFallbackService,
                hermesConversationStateStore,
                hermesMcpSessionTokenService,
                hermesChatAuditRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of("这个项目当前最大的阻塞是什么"),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq("test-conversation")))
                .thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq("test-conversation")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token")))
                .thenReturn(prompt);
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-1", "完整回答内容"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = hermesChatService.chat(new HermesChatRequest(
                "这个项目当前最大的阻塞是什么",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "test-conversation",
                null,
                null
        ));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:test-conversation");
        assertThat(finalState.mcpSessionToken()).isEqualTo("session-token");
        assertThat(finalState.transcript()).extracting(HermesConversationTurn::role).containsExactly("user", "assistant");
        assertThat(finalState.transcript().get(0).content()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(finalState.transcript().get(1).content()).isEqualTo("完整回答内容");
        assertThat(response.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:test-conversation");
        assertThat(response.content()).isEqualTo("完整回答内容");
    }

    /**
     * 当用户从候选卡片中完成选择时，backend 应写入结构化恢复消息，而不是简单重复原始问题。
     */
    @Test
    void shouldPersistStructuredSelectionResumeMessage() {
        HermesChatService hermesChatService = new HermesChatService(
                authService,
                userRepository,
                new HermesProperties(
                        "http://localhost:18080/v1",
                        "",
                        "hermes-agent",
                        60,
                        "test:hermes",
                        4,
                        86400
                ),
                hermesContextAssembler,
                hermesPromptBuilder,
                hermesGatewayService,
                hermesToolOrchestrator,
                hermesActionFallbackService,
                hermesConversationStateStore,
                hermesMcpSessionTokenService,
                hermesChatAuditRepository,
                new ObjectMapper()
        );

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of("继续处理当前需求"),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");
        HermesConversationState existingState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:test-conversation",
                "test-conversation",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot("原始问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(HermesConversationTurn.user("上一轮问题"), HermesConversationTurn.assistant("上一轮回答")),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                HermesGroundingState.empty(),
                List.of(),
                ""
        );
        HermesGroundingState selectedGrounding = HermesGroundingState.empty().withBoundSlot(
                "workItem",
                new HermesGroundingTarget(
                        "workItem",
                        "WORK_ITEM",
                        101L,
                        "REQ-123 登录改造",
                        "/projects/12/iterations?openTaskId=101",
                        12L,
                        "SELECTION",
                        Map.of("workItemId", 101L)
                )
        );

        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq("test-conversation")))
                .thenReturn(Optional.of(existingState));
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:test-conversation"), eq("test-conversation")))
                .thenReturn("session-token");
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(selectedGrounding);
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), eq(selectedGrounding), eq("session-token")))
                .thenReturn(prompt);
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-2", "已基于你确认的对象继续分析"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(new HermesChatRequest(
                "继续处理当前需求",
                "project-iterations",
                12L,
                null,
                null,
                null,
                "test-conversation",
                new HermesSelectionRequest("workItem", "WORK_ITEM", 101L, "继续处理当前需求"),
                null
        ));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.transcript()).hasSize(4);
        assertThat(finalState.transcript().get(2).content()).contains("用户刚刚在平台候选卡片中完成了对象确认");
        assertThat(finalState.transcript().get(2).content()).contains("REQ-123 登录改造");
        assertThat(finalState.transcript().get(3).content()).isEqualTo("已基于你确认的对象继续分析");
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
                List.of("hermes:chat", "project:view", "task:view", "task:manage")
        );
    }
}
