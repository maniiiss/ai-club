package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantChatAuditEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.AssistantConversationAttachmentEntity;
import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantActionSummary;
import com.aiclub.platform.dto.AssistantConversationContextSnapshot;
import com.aiclub.platform.dto.AssistantConversationRequestSnapshot;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.dto.AssistantGroundingState;
import com.aiclub.platform.dto.AssistantGroundingTarget;
import com.aiclub.platform.dto.AssistantReferenceSummary;
import com.aiclub.platform.dto.AssistantSelectionCard;
import com.aiclub.platform.dto.AssistantSelectionOption;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.AssistantMultipartChatCommand;
import com.aiclub.platform.dto.request.AssistantSelectionRequest;
import com.aiclub.platform.dto.request.AssistantSessionChatRequest;
import com.aiclub.platform.repository.AssistantChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.service.assistant.prompt.ExecutionTaskQueryAssistantPromptSkill;
import com.aiclub.platform.service.assistant.prompt.AssistantPromptResourceLoader;
import com.aiclub.platform.service.assistant.prompt.PersonalFileLibraryAssistantPromptSkill;
import com.aiclub.platform.service.assistant.prompt.RepoScanAssistantPromptSkill;
import com.aiclub.platform.service.assistant.prompt.WikiQaAssistantPromptSkill;
import com.aiclub.platform.service.assistant.prompt.WorkItemCreateAssistantPromptSkill;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Assistant 聊天服务会按持久化会话上下文工作，并继续维护 Redis 热状态。
 */
@ExtendWith(MockitoExtension.class)
class AssistantChatServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AssistantContextAssembler assistantContextAssembler;

    @Mock
    private AssistantPromptBuilder assistantPromptBuilder;

    @Mock
    private AssistantGatewayService assistantGatewayService;

    @Mock
    private AssistantHindsightMemoryService assistantHindsightMemoryService;

    @Mock
    private AssistantToolOrchestrator assistantToolOrchestrator;

    @Mock
    private AssistantActionFallbackService assistantActionFallbackService;

    @Mock
    private AssistantConversationStateStore assistantConversationStateStore;

    @Mock
    private AssistantMcpSessionTokenService assistantMcpSessionTokenService;

    @Mock
    private AssistantChatAuditRepository assistantChatAuditRepository;

    @Mock
    private AssistantConversationSessionService assistantConversationSessionService;

    @Mock
    private AssistantAttachmentService assistantAttachmentService;

    @Mock
    private WikiKnowledgeSearchService wikiKnowledgeSearchService;

    @Mock
    private AssistantFileLibraryService assistantFileLibraryService;

    /**
     * 项目会话应生成带持久化 conversationId 的 scopeKey，并在回答后把 transcript 写回 Redis。
     */
    @Test
    void shouldUsePersistedSessionConversationIdAndPersistConversationState() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
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
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("- 项目记忆命中");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("- Wiki 证据命中");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-1", "完整回答内容"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = assistantChatService.chat(10L, new AssistantSessionChatRequest("这个项目当前最大的阻塞是什么", null, null, null));

        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        ArgumentCaptor<List<AssistantConversationTurn>> outboundTranscriptCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(assistantConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(assistantGatewayService).createChatCompletion(eq(prompt), outboundTranscriptCaptor.capture());
        verify(assistantPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), eq("### Hindsight 记忆\n- 项目记忆命中\n\n### Wiki 知识证据\n- Wiki 证据命中"));
        AssistantConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:conversation-1");
        assertThat(finalState.mcpSessionToken()).isEqualTo("session-token");
        assertThat(finalState.transcript()).extracting(AssistantConversationTurn::role).containsExactly("user", "assistant");
        assertThat(finalState.transcript().get(0).content()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(finalState.transcript().get(1).content()).isEqualTo("完整回答内容");
        assertThat(outboundTranscriptCaptor.getValue()).isEmpty();
        assertThat(currentTurnContentCaptor.getValue()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(response.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:conversation-1");
        assertThat(response.content()).isEqualTo("完整回答内容");
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq("完整回答内容"), any(), eq(List.of()));
        verify(assistantHindsightMemoryService).retainConversationTurnAsync(eq(currentUser), eq(session), eq(context), any(AssistantChatRequest.class), eq("完整回答内容"), eq(finalState));
    }

    /**
     * 当用户从候选卡片中完成选择时，Redis transcript 应继续写入结构化恢复消息。
     */
    @Test
    void shouldPersistStructuredSelectionResumeMessage() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of("继续处理当前需求"),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");
        AssistantConversationState existingState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot("原始问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(AssistantConversationTurn.user("上一轮问题"), AssistantConversationTurn.assistant("上一轮回答")),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                AssistantGroundingState.empty(),
                List.of(),
                ""
        );
        AssistantGroundingState selectedGrounding = AssistantGroundingState.empty().withBoundSlot(
                "workItem",
                new AssistantGroundingTarget(
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

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn(Optional.of(existingState));
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(selectedGrounding);
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), eq(selectedGrounding), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-2", "已基于你确认的对象继续分析"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("继续处理当前需求", new AssistantSelectionRequest("workItem", "WORK_ITEM", 101L, "继续处理当前需求"), null, null));

        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        verify(assistantConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        AssistantConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.transcript()).hasSize(4);
        assertThat(finalState.transcript().get(2).content()).contains("用户刚刚在平台候选卡片中完成了对象确认");
        assertThat(finalState.transcript().get(2).content()).contains("REQ-123 登录改造");
        assertThat(finalState.transcript().get(3).content()).isEqualTo("已基于你确认的对象继续分析");
        assertThat(finalState.selectionCards()).isEmpty();
    }

    /**
     * 用户没有点击旧确认卡片而是直接发送新问题时，本轮应视为重新提问。
     * 旧动作卡片和旧候选卡片不能再从 Redis meta 回流到前端。
     */
    @Test
    void shouldClearStalePendingConfirmationsWhenUserSendsFreshQuestion() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantActionSummary staleAction = new AssistantActionSummary(
                "CREATE_EXECUTION_TASK",
                "旧执行动作",
                "旧的待确认动作",
                true,
                Map.of("projectId", 12L, "workItemId", 101L)
        );
        AssistantSelectionCard staleSelectionCard = new AssistantSelectionCard(
                "project",
                "旧项目候选",
                "旧的候选确认",
                "旧问题",
                List.of(new AssistantSelectionOption("project", "PROJECT", 12L, "支付项目", "状态：进行中", "/projects/12/iterations", 80D, List.of("旧候选")))
        );
        AssistantConversationState existingState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot("旧问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(AssistantConversationTurn.user("旧问题"), AssistantConversationTurn.assistant("旧回答")),
                context.references(),
                context.suggestions(),
                List.of(staleAction),
                List.of(staleSelectionCard),
                AssistantGroundingState.empty(),
                List.of(),
                ""
        );
        AtomicReference<AssistantConversationState> redisState = new AtomicReference<>(existingState);
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(assistantConversationStateStore).save(any(AssistantConversationState.class));
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-fresh", "这是新问题的回答"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("换个问题，帮我总结当前项目风险", null, null, null));

        AssistantConversationState finalState = redisState.get();
        assertThat(finalState.actions()).isEmpty();
        assertThat(finalState.selectionCards()).isEmpty();
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq("这是新问题的回答"), any(), eq(List.of()));
    }

    /**
     * 前一轮工具调用轨迹只应属于那一轮回答。
     * 用户继续提问时，新一轮 Redis 会话态必须从空工具轨迹开始，避免旧工具调用继续挂到新回答下面。
     */
    @Test
    void shouldClearStaleToolExecutionsWhenUserSendsFreshQuestion() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantConversationState existingState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot("上一轮问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(AssistantConversationTurn.user("上一轮问题"), AssistantConversationTurn.assistant("上一轮回答")),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                AssistantGroundingState.empty(),
                List.of(Map.of("toolCode", "project.search", "status", "SUCCESS", "message", "查到项目")),
                ""
        );
        AtomicReference<AssistantConversationState> redisState = new AtomicReference<>(existingState);
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(assistantConversationStateStore).save(any(AssistantConversationState.class));
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-new", "这是新问题的回答"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("继续说一下新的风险", null, null, null));

        AssistantConversationState finalState = redisState.get();
        assertThat(finalState.toolExecutions()).isEmpty();
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq("这是新问题的回答"), any(), eq(List.of()));
    }

    /**
     * 同一轮工具链中途产生了候选卡，但最终回答已经给出实质结论时，
     * done 事件和 Redis 最终态不能继续携带这张候选卡，避免前端答完后仍提示确认迭代。
     */
    @Test
    void shouldClearIntermediateSelectionCardsWhenFinalAnswerDoesNotAskForSelection() throws IOException {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        String question = "这个项目最大的风险是什么";
        AssistantSelectionCard intermediateSelectionCard = new AssistantSelectionCard(
                "iteration",
                "请确认你指的是哪个迭代",
                "当前有多个候选命中，Assistant 需要你先选定一个对象再继续。",
                question,
                List.of(new AssistantSelectionOption("iteration", "ITERATION", 31L, "一期迭代", "进行中", "/projects/12/iterations/31", 80D, List.of("名称相近")))
        );
        AssistantConversationState inFlightState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot(question, "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(intermediateSelectionCard),
                AssistantGroundingState.empty().withPendingSelectionCards(List.of(intermediateSelectionCard), question),
                List.of(Map.of("toolCode", "project.list_iterations", "status", "STOPPED", "message", "产生歧义候选，需要用户确认")),
                ""
        );
        AtomicReference<AssistantConversationState> redisState = new AtomicReference<>();
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.ofNullable(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(assistantConversationStateStore).save(any(AssistantConversationState.class));
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(inFlightState);
                    AssistantGatewayService.AssistantDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("最大风险是核心接口联调时间不足，需要尽快冻结范围。");
                    return new AssistantGatewayService.AssistantGatewayResult("stream-risk", "最大风险是核心接口联调时间不足，需要尽快冻结范围。");
                });
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        assistantChatService.streamChat(10L, new AssistantSessionChatRequest(question, null, null, null))
                .writeTo(outputStream);

        AssistantConversationState finalState = redisState.get();
        String streamOutput = outputStream.toString(StandardCharsets.UTF_8);
        assertThat(finalState.selectionCards()).isEmpty();
        assertThat(finalState.groundingState().pendingSelectionCards()).isEmpty();
        assertThat(streamOutput).contains("\"selectionCards\":[]");
        assertThat(streamOutput).doesNotContain("请确认你指的是哪个迭代");
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq("最大风险是核心接口联调时间不足，需要尽快冻结范围。"), any(), eq(List.of()));
    }

    /**
     * 如果最终回答仍明确要求用户在候选卡片中选择对象，候选卡必须保留，避免破坏正常澄清链路。
     */
    @Test
    void shouldKeepSelectionCardsWhenFinalAnswerStillAsksForSelection() throws IOException {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        String question = "看一下这个迭代的工作项";
        AssistantSelectionCard selectionCard = new AssistantSelectionCard(
                "iteration",
                "请确认你指的是哪个迭代",
                "当前有多个候选命中，Assistant 需要你先选定一个对象再继续。",
                question,
                List.of(new AssistantSelectionOption("iteration", "ITERATION", 31L, "一期迭代", "进行中", "/projects/12/iterations/31", 80D, List.of("名称相近")))
        );
        AssistantConversationState inFlightState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot(question, "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(selectionCard),
                AssistantGroundingState.empty().withPendingSelectionCards(List.of(selectionCard), question),
                List.of(Map.of("toolCode", "project.list_iterations", "status", "STOPPED", "message", "产生歧义候选，需要用户确认")),
                ""
        );
        AtomicReference<AssistantConversationState> redisState = new AtomicReference<>();
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");
        String finalContent = "我已经查到多个候选迭代，请在候选卡片中选择一个后继续。";

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.ofNullable(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(assistantConversationStateStore).save(any(AssistantConversationState.class));
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(inFlightState);
                    AssistantGatewayService.AssistantDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta(finalContent);
                    return new AssistantGatewayService.AssistantGatewayResult("stream-selection", finalContent);
                });
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        assistantChatService.streamChat(10L, new AssistantSessionChatRequest(question, null, null, null))
                .writeTo(outputStream);

        AssistantConversationState finalState = redisState.get();
        String streamOutput = outputStream.toString(StandardCharsets.UTF_8);
        assertThat(finalState.selectionCards()).containsExactly(selectionCard);
        assertThat(finalState.groundingState().pendingSelectionCards()).containsExactly(selectionCard);
        assertThat(streamOutput).contains("请确认你指的是哪个迭代");
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq(finalContent), any(), eq(List.of()));
    }

    /**
     * 聊天时应始终以会话绑定的上下文装配 Assistant 请求，而不是外部页面瞬时上下文。
     */
    @Test
    void shouldAssembleContextFromPersistedSessionBinding() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-3", "ok"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("帮我总结当前进展", null, null, null));

        ArgumentCaptor<AssistantChatRequest> requestCaptor = ArgumentCaptor.forClass(AssistantChatRequest.class);
        verify(assistantContextAssembler).assemble(requestCaptor.capture(), eq(currentUser));
        AssistantChatRequest assembledRequest = requestCaptor.getValue();

        assertThat(assembledRequest.routeName()).isEqualTo("project-iterations");
        assertThat(assembledRequest.projectId()).isEqualTo(12L);
        assertThat(assembledRequest.clientConversationId()).isEqualTo("conversation-1");
    }

    /**
     * 本轮携带附件提问时，应把转换后的 Markdown 正文注入 Assistant transcript，避免模型只看到文件名。
     */
    @Test
    void shouldInjectPreparedAttachmentMarkdownIntoTranscript() {
        AssistantChatService assistantChatService = createService(assistantAttachmentService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");
        DocumentAssetEntity asset = buildDocumentAsset(201L, "设计说明.docx");
        AssistantAttachmentService.PreparedAttachment attachment = new AssistantAttachmentService.PreparedAttachment(
                asset,
                new DocumentMarkdownResult(
                        201L,
                        "设计说明.docx",
                        "登录设计说明",
                        "DOCX",
                        "# 登录设计\n\n系统需要支持短信验证码与密码双因子登录。",
                        false,
                        List.of()
                )
        );

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantAttachmentService.uploadAndConvert(any())).thenReturn(List.of(attachment));
        when(assistantAttachmentService.buildPreparedAttachmentContextMarkdown(List.of(attachment))).thenReturn("""
                ## 本轮上传附件
                ### 附件 1
                以下是从该附件提取出的 Markdown 正文，请优先基于这些内容回答：
                ```markdown
                # 登录设计

                系统需要支持短信验证码与密码双因子登录。
                ```
                """.trim());
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-4", "这份文档主要描述登录设计"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantMultipartChatCommand(
                "解释一下这份文档的内容",
                null,
                null,
                List.of(new MockMultipartFile(
                        "files",
                        "设计说明.docx",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "fake".getBytes()
                ))
        ));

        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(assistantConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(assistantPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), eq(""));
        AssistantConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.transcript().get(0).content()).contains("解释一下这份文档的内容");
        assertThat(finalState.transcript().get(0).content()).contains("以下是从该附件提取出的 Markdown 正文");
        assertThat(finalState.transcript().get(0).content()).contains("# 登录设计");
        assertThat(finalState.transcript().get(0).content()).contains("短信验证码与密码双因子登录");
        assertThat(currentTurnContentCaptor.getValue()).contains("以下是从该附件提取出的 Markdown 正文");
        assertThat(currentTurnContentCaptor.getValue()).contains("# 登录设计");
        verify(assistantConversationSessionService).recordSuccess(eq(session), any(AssistantChatRequest.class), eq(finalState), eq("这份文档主要描述登录设计"), any(), eq(List.of(attachment)));
    }

    /**
     * 无新附件追问时，应继续沿用最近一轮附件的 Markdown 内容，保证“继续解释文档”能够成立。
     */
    @Test
    void shouldReuseRecentAttachmentMarkdownForFollowUpQuestion() {
        AssistantChatService assistantChatService = createService(assistantAttachmentService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");
        AssistantConversationAttachmentEntity recentAttachment = new AssistantConversationAttachmentEntity();
        recentAttachment.setDocumentAsset(buildDocumentAsset(202L, "方案.pdf"));
        recentAttachment.setSuggestedTitle("认证升级方案");
        recentAttachment.setMarkdown("## 方案摘要\n\n需要新增统一认证中台，并兼容旧版登录流程。");
        recentAttachment.setTruncated(false);
        recentAttachment.setWarningsJson("[]");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantAttachmentService.findRecentAttachments(10L)).thenReturn(List.of(recentAttachment));
        when(assistantAttachmentService.buildAttachmentContextMarkdown(List.of(recentAttachment))).thenReturn("""
                ## 最近一轮可用附件
                ### 附件 1
                以下是从该附件提取出的 Markdown 正文，请优先基于这些内容回答：
                ```markdown
                ## 方案摘要

                需要新增统一认证中台，并兼容旧版登录流程。
                ```
                """.trim());
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-5", "我继续基于上一个附件做解释"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("继续解释这份文档", null, null, null));

        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        verify(assistantConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        AssistantConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.transcript().get(0).content()).contains("继续解释这份文档");
        assertThat(finalState.transcript().get(0).content()).contains("最近一轮可用附件");
        assertThat(finalState.transcript().get(0).content()).contains("## 方案摘要");
        assertThat(finalState.transcript().get(0).content()).contains("统一认证中台");
    }

    /**
     * 显式选择文件库 Skill 时，个人文件库证据必须进入当前轮用户消息，
     * 让模型即使在项目页面也会优先基于文件库正文回答。
     */
    @Test
    void shouldInjectFileLibraryEvidenceIntoCurrentTurnWhenFileLibrarySkillSelected() {
        AssistantChatService assistantChatService = createService(assistantPromptBuilder, null, assistantFileLibraryService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "示例项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(assistantFileLibraryService.buildEvidenceMarkdown(eq(currentUser), eq("我的年终述职报告有哪些内容")))
                .thenReturn("- 年终述职报告：完成了项目治理、自动化测试和交付提效。");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-file", "文件库回答"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("我的年终述职报告有哪些内容", null, null, "/文件库"));

        ArgumentCaptor<AssistantConversationState> stateCaptor = ArgumentCaptor.forClass(AssistantConversationState.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(assistantConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(assistantPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());
        AssistantConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(currentTurnContentCaptor.getValue())
                .contains("用户已显式选择 Skill：/文件库")
                .contains("以下是本轮必须优先使用的个人文件库证据")
                .contains("年终述职报告")
                .contains("交付提效");
        assertThat(finalState.transcript().get(0).content())
                .contains("以下是本轮必须优先使用的个人文件库证据")
                .contains("年终述职报告");
    }

    /**
     * 显式选择仓库扫描 Skill 时，即使用户没有补充动词，也要把本轮转成专项启动请求，
     * 避免模型继续按普通聊天等待用户再次输入“发起扫描”。
     */
    @Test
    void shouldInjectRepoScanSpecializedInstructionWhenRepoScanSkillSelected() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-scan", "扫描专项回答"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("发起仓库扫描", null, null, "/仓库扫描"));

        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(assistantPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());

        assertThat(currentTurnContentCaptor.getValue())
                .contains("用户已显式选择 Skill：/仓库扫描")
                .contains("本轮必须进入仓库扫描专项流程")
                .contains("先确认 GitLab 仓库绑定")
                .contains("再确认仓库扫描规则集")
                .contains("不要只解释仓库扫描能力");
    }

    /**
     * 其他显式 Slash Skill 也应被转成专项任务入口，避免和未选择 Skill 的普通问答没有差异。
     */
    @Test
    void shouldInjectSpecializedInstructionForOtherSelectedBusinessSkills() {
        AssistantChatService assistantChatService = createService();

        assertSelectedSkillInstruction(assistantChatService, "/wiki", "本轮必须进入 Wiki 问答专项流程");
        assertSelectedSkillInstruction(assistantChatService, "/需求", "本轮必须进入需求/工作项专项流程");
        assertSelectedSkillInstruction(assistantChatService, "/执行任务", "本轮必须进入执行任务专项流程");
    }

    /**
     * 使用真实 PromptBuilder 时，传给 Assistant 网关的 system prompt 应包含命中的 Skill 片段。
     */
    @Test
    void shouldPassMatchedSkillPromptToGateway() {
        AssistantPromptResourceLoader resourceLoader = new AssistantPromptResourceLoader();
        AssistantPromptBuilder realPromptBuilder = new AssistantPromptBuilder(
                resourceLoader,
                List.of(
                        new WikiQaAssistantPromptSkill(resourceLoader),
                        new PersonalFileLibraryAssistantPromptSkill(resourceLoader),
                        new WorkItemCreateAssistantPromptSkill(resourceLoader),
                        new RepoScanAssistantPromptSkill(resourceLoader),
                        new ExecutionTaskQueryAssistantPromptSkill(resourceLoader)
                )
        );
        AssistantChatService assistantChatService = createService(realPromptBuilder, null);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        session.setRouteName("wiki-space-page");
        session.setProjectId(null);
        session.setWikiSpaceId(8L);
        session.setWikiPageId(15L);
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "wiki-space-page",
                null,
                null,
                8L,
                15L,
                "知识管理员",
                List.of(new AssistantReferenceSummary("WIKI_PAGE", 15L, "登录说明", "/wiki/spaces/8/pages/15")),
                List.of("帮我总结当前 Wiki 页面"),
                "Wiki 页面上下文"
        );

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(any(), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-6", "这是当前页面的总结"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(10L, new AssistantSessionChatRequest("帮我总结当前页", null, null, "/wiki"));

        ArgumentCaptor<AssistantPromptBuilder.AssistantPrompt> promptCaptor = ArgumentCaptor.forClass(AssistantPromptBuilder.AssistantPrompt.class);
        verify(assistantGatewayService).createChatCompletion(promptCaptor.capture(), any());
        verify(assistantPromptBuilder, never()).buildConversationPrompt(any(), any(), any(), any(), any());
        assertThat(promptCaptor.getValue().systemPrompt())
                .contains("## 当前已启用 Skills")
                .contains("### Skill: wiki-qa")
                .contains("不要直接声称平台不支持访问 Wiki");
    }

    /**
     * 浏览器中途断开流式连接属于客户端传输中断，不应被保存成 Assistant 失败回答。
     */
    @Test
    void shouldNotRecordFailureWhenClientDisconnectsDuringStreamDelta() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    AssistantGatewayService.AssistantDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("正在整理工具结果");
                    return new AssistantGatewayService.AssistantGatewayResult("stream-disconnect", "完整回答");
                });
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThatCode(() -> assistantChatService.streamChat(10L, new AssistantSessionChatRequest("帮我总结当前项目", null, null, null))
                .writeTo(new DisconnectOnDeltaOutputStream()))
                .doesNotThrowAnyException();

        verify(assistantConversationSessionService, never()).recordFailure(any(), any(), any(), any(), any(), any());
        verify(assistantConversationSessionService, never()).recordSuccess(any(), any(), any(), any(), any(), any());
        verify(assistantHindsightMemoryService, never()).retainConversationTurnAsync(any(), any(), any(), any(), any(), any());
    }

    /**
     * 如果工具已经把待确认动作写入 Redis，但前端在最终 done 前断开，
     * 后端仍应保存最新展示态，便于前端刷新会话后继续看到确认卡片。
     */
    @Test
    void shouldPersistLatestDisplayStateWhenClientDisconnectsAfterPendingActionCreated() {
        AssistantChatService assistantChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system", "user");
        AssistantActionSummary pendingAction = new AssistantActionSummary(
                "CREATE_EXECUTION_TASK",
                "发起执行任务",
                "确认后会基于当前工作项创建执行任务。",
                true,
                Map.of("projectId", 12L, "workItemId", 101L)
        );
        AssistantConversationState preparedActionState = new AssistantConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                AssistantConversationContextSnapshot.fromContext(context),
                new AssistantConversationRequestSnapshot("帮我发起执行任务", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(pendingAction),
                List.of(),
                AssistantGroundingState.empty(),
                List.of(Map.of("toolCode", "execution_task.create", "status", "STOPPED", "message", "写操作已转为确认卡片")),
                ""
        );
        AtomicReference<AssistantConversationState> redisState = new AtomicReference<>(preparedActionState);

        when(assistantConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(assistantConversationStateStore).save(any(AssistantConversationState.class));
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(assistantGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(preparedActionState);
                    AssistantGatewayService.AssistantDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("我已经准备好了待确认动作");
                    return new AssistantGatewayService.AssistantGatewayResult("stream-action-disconnect", "我已经准备好了待确认动作");
                });
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThatCode(() -> assistantChatService.streamChat(10L, new AssistantSessionChatRequest("帮我发起执行任务", null, null, null))
                .writeTo(new DisconnectOnDeltaOutputStream()))
                .doesNotThrowAnyException();

        verify(assistantConversationSessionService).recordLatestDisplayState(eq(session), eq(preparedActionState), any());
        verify(assistantConversationSessionService, never()).recordFailure(any(), any(), any(), any(), any(), any());
        verify(assistantConversationSessionService, never()).recordSuccess(any(), any(), any(), any(), any(), any());
    }

    private AssistantChatService createService() {
        return createService(assistantPromptBuilder, null);
    }

    private AssistantChatService createService(AssistantAttachmentService attachmentService) {
        return createService(assistantPromptBuilder, attachmentService);
    }

    private AssistantChatService createService(AssistantPromptBuilder promptBuilder, AssistantAttachmentService attachmentService) {
        return createService(promptBuilder, attachmentService, null);
    }

    private AssistantChatService createService(AssistantPromptBuilder promptBuilder,
                                            AssistantAttachmentService attachmentService,
                                            AssistantFileLibraryService fileLibraryService) {
        return new AssistantChatService(
                authService,
                userRepository,
                new AssistantProperties(
                        "http://localhost:18080/v1",
                        "",
                        "hermes-agent",
                        60,
                        "test:hermes",
                        4,
                        86400
                ),
                assistantContextAssembler,
                promptBuilder,
                assistantGatewayService,
                assistantHindsightMemoryService,
                assistantToolOrchestrator,
                assistantActionFallbackService,
                assistantConversationStateStore,
                assistantMcpSessionTokenService,
                assistantChatAuditRepository,
                assistantConversationSessionService,
                attachmentService,
                wikiKnowledgeSearchService,
                fileLibraryService,
                new ObjectMapper()
        );
    }

    private void assertSelectedSkillInstruction(AssistantChatService assistantChatService, String slashCommand, String expectedInstruction) {
        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        AssistantConversationSessionEntity session = buildSessionEntity();
        session.setId(10L + Math.abs(slashCommand.hashCode() % 1000));
        session.setClientConversationId("conversation-" + slashCommand.replace("/", ""));
        AssistantContextAssembler.AssistantConversationContext context = new AssistantContextAssembler.AssistantConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new AssistantReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        AssistantPromptBuilder.AssistantPrompt prompt = new AssistantPromptBuilder.AssistantPrompt("system-" + slashCommand, "user");

        when(assistantConversationSessionService.requireOwnedSession(session.getId())).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(assistantContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(assistantConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(assistantToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(AssistantGroundingState.empty());
        when(assistantMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(assistantPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(assistantHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(assistantActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(assistantGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new AssistantGatewayService.AssistantGatewayResult("resp-" + slashCommand, "专项回答"));
        when(assistantChatAuditRepository.save(any(AssistantChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assistantChatService.chat(session.getId(), new AssistantSessionChatRequest("继续", null, null, slashCommand));

        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(assistantPromptBuilder, atLeast(1)).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());
        String latestCurrentTurnContent = currentTurnContentCaptor.getAllValues().get(currentTurnContentCaptor.getAllValues().size() - 1);
        assertThat(latestCurrentTurnContent)
                .contains("用户已显式选择 Skill：" + slashCommand)
                .contains(expectedInstruction);
    }

    private AssistantConversationSessionEntity buildSessionEntity() {
        AssistantConversationSessionEntity entity = new AssistantConversationSessionEntity();
        entity.setId(10L);
        entity.setTitle("新会话");
        entity.setTitleCustomized(false);
        entity.setClientConversationId("conversation-1");
        entity.setRouteName("project-iterations");
        entity.setProjectId(12L);
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
                List.of("hermes:chat", "project:view", "task:view", "task:manage"),
                List.of()
        );
    }

    private DocumentAssetEntity buildDocumentAsset(Long assetId, String fileName) {
        DocumentAssetEntity asset = new DocumentAssetEntity();
        asset.setId(assetId);
        asset.setFileName(fileName);
        asset.setContentType("application/octet-stream");
        asset.setFileSize(2048L);
        asset.setSourceFormat(fileName.endsWith(".pdf") ? "PDF" : "DOCX");
        return asset;
    }

    private static final class DisconnectOnDeltaOutputStream extends OutputStream {
        @Override
        public void write(int b) {
            // 测试只使用批量写入路径。
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            String chunk = new String(b, off, len, StandardCharsets.UTF_8);
            if (chunk.contains("event:delta")) {
                throw new IOException("Broken pipe");
            }
        }
    }
}
