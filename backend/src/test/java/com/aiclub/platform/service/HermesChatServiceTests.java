package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.HermesConversationAttachmentEntity;
import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesConversationContextSnapshot;
import com.aiclub.platform.dto.HermesConversationRequestSnapshot;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesConversationTurn;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.HermesSelectionCard;
import com.aiclub.platform.dto.HermesSelectionOption;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesMultipartChatCommand;
import com.aiclub.platform.dto.request.HermesSelectionRequest;
import com.aiclub.platform.dto.request.HermesSessionChatRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.service.hermes.prompt.ExecutionTaskQueryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.HermesPromptResourceLoader;
import com.aiclub.platform.service.hermes.prompt.PersonalFileLibraryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.RepoScanHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WikiQaHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WorkItemCreateHermesPromptSkill;
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
 * 验证 Hermes 聊天服务会按持久化会话上下文工作，并继续维护 Redis 热状态。
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
    private HermesHindsightMemoryService hermesHindsightMemoryService;

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

    @Mock
    private HermesConversationSessionService hermesConversationSessionService;

    @Mock
    private HermesAttachmentService hermesAttachmentService;

    @Mock
    private WikiKnowledgeSearchService wikiKnowledgeSearchService;

    @Mock
    private HermesFileLibraryService hermesFileLibraryService;

    /**
     * 项目会话应生成带持久化 conversationId 的 scopeKey，并在回答后把 transcript 写回 Redis。
     */
    @Test
    void shouldUsePersistedSessionConversationIdAndPersistConversationState() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
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
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("- 项目记忆命中");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("- Wiki 证据命中");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-1", "完整回答内容"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = hermesChatService.chat(10L, new HermesSessionChatRequest("这个项目当前最大的阻塞是什么", null, null, null));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        ArgumentCaptor<List<HermesConversationTurn>> outboundTranscriptCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(hermesGatewayService).createChatCompletion(eq(prompt), outboundTranscriptCaptor.capture());
        verify(hermesPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), eq("### Hindsight 记忆\n- 项目记忆命中\n\n### Wiki 知识证据\n- Wiki 证据命中"));
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:conversation-1");
        assertThat(finalState.mcpSessionToken()).isEqualTo("session-token");
        assertThat(finalState.transcript()).extracting(HermesConversationTurn::role).containsExactly("user", "assistant");
        assertThat(finalState.transcript().get(0).content()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(finalState.transcript().get(1).content()).isEqualTo("完整回答内容");
        assertThat(outboundTranscriptCaptor.getValue()).isEmpty();
        assertThat(currentTurnContentCaptor.getValue()).isEqualTo("这个项目当前最大的阻塞是什么");
        assertThat(response.scopeKey()).isEqualTo("test:hermes:project:12:user:5:conversation:conversation-1");
        assertThat(response.content()).isEqualTo("完整回答内容");
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq("完整回答内容"), any(), eq(List.of()));
        verify(hermesHindsightMemoryService).retainConversationTurnAsync(eq(currentUser), eq(session), eq(context), any(HermesChatRequest.class), eq("完整回答内容"), eq(finalState));
    }

    /**
     * 当用户从候选卡片中完成选择时，Redis transcript 应继续写入结构化恢复消息。
     */
    @Test
    void shouldPersistStructuredSelectionResumeMessage() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
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
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
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

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn(Optional.of(existingState));
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(selectedGrounding);
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), eq(selectedGrounding), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-2", "已基于你确认的对象继续分析"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("继续处理当前需求", new HermesSelectionRequest("workItem", "WORK_ITEM", 101L, "继续处理当前需求"), null, null));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

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
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesActionSummary staleAction = new HermesActionSummary(
                "CREATE_EXECUTION_TASK",
                "旧执行动作",
                "旧的待确认动作",
                true,
                Map.of("projectId", 12L, "workItemId", 101L)
        );
        HermesSelectionCard staleSelectionCard = new HermesSelectionCard(
                "project",
                "旧项目候选",
                "旧的候选确认",
                "旧问题",
                List.of(new HermesSelectionOption("project", "PROJECT", 12L, "支付项目", "状态：进行中", "/projects/12/iterations", 80D, List.of("旧候选")))
        );
        HermesConversationState existingState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot("旧问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(HermesConversationTurn.user("旧问题"), HermesConversationTurn.assistant("旧回答")),
                context.references(),
                context.suggestions(),
                List.of(staleAction),
                List.of(staleSelectionCard),
                HermesGroundingState.empty(),
                List.of(),
                ""
        );
        AtomicReference<HermesConversationState> redisState = new AtomicReference<>(existingState);
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(hermesConversationStateStore).save(any(HermesConversationState.class));
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-fresh", "这是新问题的回答"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("换个问题，帮我总结当前项目风险", null, null, null));

        HermesConversationState finalState = redisState.get();
        assertThat(finalState.actions()).isEmpty();
        assertThat(finalState.selectionCards()).isEmpty();
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq("这是新问题的回答"), any(), eq(List.of()));
    }

    /**
     * 前一轮工具调用轨迹只应属于那一轮回答。
     * 用户继续提问时，新一轮 Redis 会话态必须从空工具轨迹开始，避免旧工具调用继续挂到新回答下面。
     */
    @Test
    void shouldClearStaleToolExecutionsWhenUserSendsFreshQuestion() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesConversationState existingState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot("上一轮问题", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(HermesConversationTurn.user("上一轮问题"), HermesConversationTurn.assistant("上一轮回答")),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(),
                HermesGroundingState.empty(),
                List.of(Map.of("toolCode", "project.search", "status", "SUCCESS", "message", "查到项目")),
                ""
        );
        AtomicReference<HermesConversationState> redisState = new AtomicReference<>(existingState);
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(hermesConversationStateStore).save(any(HermesConversationState.class));
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-new", "这是新问题的回答"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("继续说一下新的风险", null, null, null));

        HermesConversationState finalState = redisState.get();
        assertThat(finalState.toolExecutions()).isEmpty();
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq("这是新问题的回答"), any(), eq(List.of()));
    }

    /**
     * 同一轮工具链中途产生了候选卡，但最终回答已经给出实质结论时，
     * done 事件和 Redis 最终态不能继续携带这张候选卡，避免前端答完后仍提示确认迭代。
     */
    @Test
    void shouldClearIntermediateSelectionCardsWhenFinalAnswerDoesNotAskForSelection() throws IOException {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        String question = "这个项目最大的风险是什么";
        HermesSelectionCard intermediateSelectionCard = new HermesSelectionCard(
                "iteration",
                "请确认你指的是哪个迭代",
                "当前有多个候选命中，Hermes 需要你先选定一个对象再继续。",
                question,
                List.of(new HermesSelectionOption("iteration", "ITERATION", 31L, "一期迭代", "进行中", "/projects/12/iterations/31", 80D, List.of("名称相近")))
        );
        HermesConversationState inFlightState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot(question, "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(intermediateSelectionCard),
                HermesGroundingState.empty().withPendingSelectionCards(List.of(intermediateSelectionCard), question),
                List.of(Map.of("toolCode", "project.list_iterations", "status", "STOPPED", "message", "产生歧义候选，需要用户确认")),
                ""
        );
        AtomicReference<HermesConversationState> redisState = new AtomicReference<>();
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.ofNullable(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(hermesConversationStateStore).save(any(HermesConversationState.class));
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(inFlightState);
                    HermesGatewayService.HermesDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("最大风险是核心接口联调时间不足，需要尽快冻结范围。");
                    return new HermesGatewayService.HermesGatewayResult("stream-risk", "最大风险是核心接口联调时间不足，需要尽快冻结范围。");
                });
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        hermesChatService.streamChat(10L, new HermesSessionChatRequest(question, null, null, null))
                .writeTo(outputStream);

        HermesConversationState finalState = redisState.get();
        String streamOutput = outputStream.toString(StandardCharsets.UTF_8);
        assertThat(finalState.selectionCards()).isEmpty();
        assertThat(finalState.groundingState().pendingSelectionCards()).isEmpty();
        assertThat(streamOutput).contains("\"selectionCards\":[]");
        assertThat(streamOutput).doesNotContain("请确认你指的是哪个迭代");
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq("最大风险是核心接口联调时间不足，需要尽快冻结范围。"), any(), eq(List.of()));
    }

    /**
     * 如果最终回答仍明确要求用户在候选卡片中选择对象，候选卡必须保留，避免破坏正常澄清链路。
     */
    @Test
    void shouldKeepSelectionCardsWhenFinalAnswerStillAsksForSelection() throws IOException {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        String question = "看一下这个迭代的工作项";
        HermesSelectionCard selectionCard = new HermesSelectionCard(
                "iteration",
                "请确认你指的是哪个迭代",
                "当前有多个候选命中，Hermes 需要你先选定一个对象再继续。",
                question,
                List.of(new HermesSelectionOption("iteration", "ITERATION", 31L, "一期迭代", "进行中", "/projects/12/iterations/31", 80D, List.of("名称相近")))
        );
        HermesConversationState inFlightState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot(question, "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(),
                List.of(selectionCard),
                HermesGroundingState.empty().withPendingSelectionCards(List.of(selectionCard), question),
                List.of(Map.of("toolCode", "project.list_iterations", "status", "STOPPED", "message", "产生歧义候选，需要用户确认")),
                ""
        );
        AtomicReference<HermesConversationState> redisState = new AtomicReference<>();
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");
        String finalContent = "我已经查到多个候选迭代，请在候选卡片中选择一个后继续。";

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.ofNullable(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(hermesConversationStateStore).save(any(HermesConversationState.class));
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(eq(currentUser), eq("test:hermes:project:12:user:5:conversation:conversation-1"), eq("conversation-1")))
                .thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(inFlightState);
                    HermesGatewayService.HermesDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta(finalContent);
                    return new HermesGatewayService.HermesGatewayResult("stream-selection", finalContent);
                });
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        hermesChatService.streamChat(10L, new HermesSessionChatRequest(question, null, null, null))
                .writeTo(outputStream);

        HermesConversationState finalState = redisState.get();
        String streamOutput = outputStream.toString(StandardCharsets.UTF_8);
        assertThat(finalState.selectionCards()).containsExactly(selectionCard);
        assertThat(finalState.groundingState().pendingSelectionCards()).containsExactly(selectionCard);
        assertThat(streamOutput).contains("请确认你指的是哪个迭代");
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq(finalContent), any(), eq(List.of()));
    }

    /**
     * 聊天时应始终以会话绑定的上下文装配 Hermes 请求，而不是外部页面瞬时上下文。
     */
    @Test
    void shouldAssembleContextFromPersistedSessionBinding() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-3", "ok"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("帮我总结当前进展", null, null, null));

        ArgumentCaptor<HermesChatRequest> requestCaptor = ArgumentCaptor.forClass(HermesChatRequest.class);
        verify(hermesContextAssembler).assemble(requestCaptor.capture(), eq(currentUser));
        HermesChatRequest assembledRequest = requestCaptor.getValue();

        assertThat(assembledRequest.routeName()).isEqualTo("project-iterations");
        assertThat(assembledRequest.projectId()).isEqualTo(12L);
        assertThat(assembledRequest.clientConversationId()).isEqualTo("conversation-1");
    }

    /**
     * 本轮携带附件提问时，应把转换后的 Markdown 正文注入 Hermes transcript，避免模型只看到文件名。
     */
    @Test
    void shouldInjectPreparedAttachmentMarkdownIntoTranscript() {
        HermesChatService hermesChatService = createService(hermesAttachmentService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");
        DocumentAssetEntity asset = buildDocumentAsset(201L, "设计说明.docx");
        HermesAttachmentService.PreparedAttachment attachment = new HermesAttachmentService.PreparedAttachment(
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

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesAttachmentService.uploadAndConvert(any())).thenReturn(List.of(attachment));
        when(hermesAttachmentService.buildPreparedAttachmentContextMarkdown(List.of(attachment))).thenReturn("""
                ## 本轮上传附件
                ### 附件 1
                以下是从该附件提取出的 Markdown 正文，请优先基于这些内容回答：
                ```markdown
                # 登录设计

                系统需要支持短信验证码与密码双因子登录。
                ```
                """.trim());
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-4", "这份文档主要描述登录设计"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesMultipartChatCommand(
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

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(hermesPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), eq(""));
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

        assertThat(finalState.transcript().get(0).content()).contains("解释一下这份文档的内容");
        assertThat(finalState.transcript().get(0).content()).contains("以下是从该附件提取出的 Markdown 正文");
        assertThat(finalState.transcript().get(0).content()).contains("# 登录设计");
        assertThat(finalState.transcript().get(0).content()).contains("短信验证码与密码双因子登录");
        assertThat(currentTurnContentCaptor.getValue()).contains("以下是从该附件提取出的 Markdown 正文");
        assertThat(currentTurnContentCaptor.getValue()).contains("# 登录设计");
        verify(hermesConversationSessionService).recordSuccess(eq(session), any(HermesChatRequest.class), eq(finalState), eq("这份文档主要描述登录设计"), any(), eq(List.of(attachment)));
    }

    /**
     * 无新附件追问时，应继续沿用最近一轮附件的 Markdown 内容，保证“继续解释文档”能够成立。
     */
    @Test
    void shouldReuseRecentAttachmentMarkdownForFollowUpQuestion() {
        HermesChatService hermesChatService = createService(hermesAttachmentService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");
        HermesConversationAttachmentEntity recentAttachment = new HermesConversationAttachmentEntity();
        recentAttachment.setDocumentAsset(buildDocumentAsset(202L, "方案.pdf"));
        recentAttachment.setSuggestedTitle("认证升级方案");
        recentAttachment.setMarkdown("## 方案摘要\n\n需要新增统一认证中台，并兼容旧版登录流程。");
        recentAttachment.setTruncated(false);
        recentAttachment.setWarningsJson("[]");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesAttachmentService.findRecentAttachments(10L)).thenReturn(List.of(recentAttachment));
        when(hermesAttachmentService.buildAttachmentContextMarkdown(List.of(recentAttachment))).thenReturn("""
                ## 最近一轮可用附件
                ### 附件 1
                以下是从该附件提取出的 Markdown 正文，请优先基于这些内容回答：
                ```markdown
                ## 方案摘要

                需要新增统一认证中台，并兼容旧版登录流程。
                ```
                """.trim());
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-5", "我继续基于上一个附件做解释"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("继续解释这份文档", null, null, null));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

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
        HermesChatService hermesChatService = createService(hermesPromptBuilder, null, hermesFileLibraryService);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "CRM 项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(hermesFileLibraryService.buildEvidenceMarkdown(eq(currentUser), eq("我的年终述职报告有哪些内容")))
                .thenReturn("- 年终述职报告：完成了项目治理、自动化测试和交付提效。");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-file", "文件库回答"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("我的年终述职报告有哪些内容", null, null, "/文件库"));

        ArgumentCaptor<HermesConversationState> stateCaptor = ArgumentCaptor.forClass(HermesConversationState.class);
        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(hermesConversationStateStore, atLeast(2)).save(stateCaptor.capture());
        verify(hermesPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());
        HermesConversationState finalState = stateCaptor.getAllValues().get(stateCaptor.getAllValues().size() - 1);

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
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-scan", "扫描专项回答"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("发起仓库扫描", null, null, "/仓库扫描"));

        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(hermesPromptBuilder).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());

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
        HermesChatService hermesChatService = createService();

        assertSelectedSkillInstruction(hermesChatService, "/wiki", "本轮必须进入 Wiki 问答专项流程");
        assertSelectedSkillInstruction(hermesChatService, "/需求", "本轮必须进入需求/工作项专项流程");
        assertSelectedSkillInstruction(hermesChatService, "/执行任务", "本轮必须进入执行任务专项流程");
    }

    /**
     * 使用真实 PromptBuilder 时，传给 Hermes 网关的 system prompt 应包含命中的 Skill 片段。
     */
    @Test
    void shouldPassMatchedSkillPromptToGateway() {
        HermesPromptResourceLoader resourceLoader = new HermesPromptResourceLoader();
        HermesPromptBuilder realPromptBuilder = new HermesPromptBuilder(
                resourceLoader,
                List.of(
                        new WikiQaHermesPromptSkill(resourceLoader),
                        new PersonalFileLibraryHermesPromptSkill(resourceLoader),
                        new WorkItemCreateHermesPromptSkill(resourceLoader),
                        new RepoScanHermesPromptSkill(resourceLoader),
                        new ExecutionTaskQueryHermesPromptSkill(resourceLoader)
                )
        );
        HermesChatService hermesChatService = createService(realPromptBuilder, null);

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        session.setRouteName("wiki-space-page");
        session.setProjectId(null);
        session.setWikiSpaceId(8L);
        session.setWikiPageId(15L);
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "wiki-space-page",
                null,
                null,
                8L,
                15L,
                "知识管理员",
                List.of(new HermesReferenceSummary("WIKI_PAGE", 15L, "登录说明", "/wiki/spaces/8/pages/15")),
                List.of("帮我总结当前 Wiki 页面"),
                "Wiki 页面上下文"
        );

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(any(), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-6", "这是当前页面的总结"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(10L, new HermesSessionChatRequest("帮我总结当前页", null, null, "/wiki"));

        ArgumentCaptor<HermesPromptBuilder.HermesPrompt> promptCaptor = ArgumentCaptor.forClass(HermesPromptBuilder.HermesPrompt.class);
        verify(hermesGatewayService).createChatCompletion(promptCaptor.capture(), any());
        verify(hermesPromptBuilder, never()).buildConversationPrompt(any(), any(), any(), any(), any());
        assertThat(promptCaptor.getValue().systemPrompt())
                .contains("## 当前已启用 Skills")
                .contains("### Skill: wiki-qa")
                .contains("不要直接声称平台不支持访问 Wiki");
    }

    /**
     * 浏览器中途断开流式连接属于客户端传输中断，不应被保存成 Hermes 失败回答。
     */
    @Test
    void shouldNotRecordFailureWhenClientDisconnectsDuringStreamDelta() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    HermesGatewayService.HermesDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("正在整理工具结果");
                    return new HermesGatewayService.HermesGatewayResult("stream-disconnect", "完整回答");
                });
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThatCode(() -> hermesChatService.streamChat(10L, new HermesSessionChatRequest("帮我总结当前项目", null, null, null))
                .writeTo(new DisconnectOnDeltaOutputStream()))
                .doesNotThrowAnyException();

        verify(hermesConversationSessionService, never()).recordFailure(any(), any(), any(), any(), any(), any());
        verify(hermesConversationSessionService, never()).recordSuccess(any(), any(), any(), any(), any(), any());
        verify(hermesHindsightMemoryService, never()).retainConversationTurnAsync(any(), any(), any(), any(), any(), any());
    }

    /**
     * 如果工具已经把待确认动作写入 Redis，但前端在最终 done 前断开，
     * 后端仍应保存最新展示态，便于前端刷新会话后继续看到确认卡片。
     */
    @Test
    void shouldPersistLatestDisplayStateWhenClientDisconnectsAfterPendingActionCreated() {
        HermesChatService hermesChatService = createService();

        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system", "user");
        HermesActionSummary pendingAction = new HermesActionSummary(
                "CREATE_EXECUTION_TASK",
                "发起执行任务",
                "确认后会基于当前工作项创建执行任务。",
                true,
                Map.of("projectId", 12L, "workItemId", 101L)
        );
        HermesConversationState preparedActionState = new HermesConversationState(
                "test:hermes:project:12:user:5:conversation:conversation-1",
                "conversation-1",
                currentUser,
                HermesConversationContextSnapshot.fromContext(context),
                new HermesConversationRequestSnapshot("帮我发起执行任务", "project-iterations", 12L, null, null, null),
                "session-token",
                List.of(),
                context.references(),
                context.suggestions(),
                List.of(pendingAction),
                List.of(),
                HermesGroundingState.empty(),
                List.of(Map.of("toolCode", "execution_task.create", "status", "STOPPED", "message", "写操作已转为确认卡片")),
                ""
        );
        AtomicReference<HermesConversationState> redisState = new AtomicReference<>(preparedActionState);

        when(hermesConversationSessionService.requireOwnedSession(10L)).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenAnswer(invocation -> Optional.of(redisState.get()));
        doAnswer(invocation -> {
            redisState.set(invocation.getArgument(0));
            return null;
        }).when(hermesConversationStateStore).save(any(HermesConversationState.class));
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(hermesGatewayService.streamChatCompletion(eq(prompt), any(), any()))
                .thenAnswer(invocation -> {
                    redisState.set(preparedActionState);
                    HermesGatewayService.HermesDeltaConsumer consumer = invocation.getArgument(2);
                    consumer.onDelta("我已经准备好了待确认动作");
                    return new HermesGatewayService.HermesGatewayResult("stream-action-disconnect", "我已经准备好了待确认动作");
                });
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThatCode(() -> hermesChatService.streamChat(10L, new HermesSessionChatRequest("帮我发起执行任务", null, null, null))
                .writeTo(new DisconnectOnDeltaOutputStream()))
                .doesNotThrowAnyException();

        verify(hermesConversationSessionService).recordLatestDisplayState(eq(session), eq(preparedActionState), any());
        verify(hermesConversationSessionService, never()).recordFailure(any(), any(), any(), any(), any(), any());
        verify(hermesConversationSessionService, never()).recordSuccess(any(), any(), any(), any(), any(), any());
    }

    private HermesChatService createService() {
        return createService(hermesPromptBuilder, null);
    }

    private HermesChatService createService(HermesAttachmentService attachmentService) {
        return createService(hermesPromptBuilder, attachmentService);
    }

    private HermesChatService createService(HermesPromptBuilder promptBuilder, HermesAttachmentService attachmentService) {
        return createService(promptBuilder, attachmentService, null);
    }

    private HermesChatService createService(HermesPromptBuilder promptBuilder,
                                            HermesAttachmentService attachmentService,
                                            HermesFileLibraryService fileLibraryService) {
        return new HermesChatService(
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
                promptBuilder,
                hermesGatewayService,
                hermesHindsightMemoryService,
                hermesToolOrchestrator,
                hermesActionFallbackService,
                hermesConversationStateStore,
                hermesMcpSessionTokenService,
                hermesChatAuditRepository,
                hermesConversationSessionService,
                attachmentService,
                wikiKnowledgeSearchService,
                fileLibraryService,
                new ObjectMapper()
        );
    }

    private void assertSelectedSkillInstruction(HermesChatService hermesChatService, String slashCommand, String expectedInstruction) {
        CurrentUserInfo currentUser = buildCurrentUser();
        UserEntity userEntity = new UserEntity();
        userEntity.setId(5L);
        userEntity.setUsername("pm-user");
        userEntity.setNickname("项目经理");
        HermesConversationSessionEntity session = buildSessionEntity();
        session.setId(10L + Math.abs(slashCommand.hashCode() % 1000));
        session.setClientConversationId("conversation-" + slashCommand.replace("/", ""));
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );
        HermesPromptBuilder.HermesPrompt prompt = new HermesPromptBuilder.HermesPrompt("system-" + slashCommand, "user");

        when(hermesConversationSessionService.requireOwnedSession(session.getId())).thenReturn(session);
        when(authService.currentUser()).thenReturn(currentUser);
        when(userRepository.findById(5L)).thenReturn(Optional.of(userEntity));
        when(hermesContextAssembler.assemble(any(), eq(currentUser))).thenReturn(context);
        when(hermesConversationStateStore.load(any(), any())).thenReturn(Optional.empty());
        when(hermesToolOrchestrator.seedGroundingState(eq(context), any(), any())).thenReturn(HermesGroundingState.empty());
        when(hermesMcpSessionTokenService.issueToken(any(), any(), any())).thenReturn("session-token");
        when(hermesPromptBuilder.buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), any(), any()))
                .thenReturn(prompt);
        when(hermesHindsightMemoryService.buildMemoryContextMarkdown(any(), any(), any())).thenReturn("");
        when(wikiKnowledgeSearchService.buildWikiEvidenceMarkdown(any(), any(), any())).thenReturn("");
        when(hermesActionFallbackService.shouldFallback(any(), any())).thenReturn(false);
        when(hermesGatewayService.createChatCompletion(eq(prompt), any()))
                .thenReturn(new HermesGatewayService.HermesGatewayResult("resp-" + slashCommand, "专项回答"));
        when(hermesChatAuditRepository.save(any(HermesChatAuditEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        hermesChatService.chat(session.getId(), new HermesSessionChatRequest("继续", null, null, slashCommand));

        ArgumentCaptor<String> currentTurnContentCaptor = ArgumentCaptor.forClass(String.class);
        verify(hermesPromptBuilder, atLeast(1)).buildConversationPrompt(eq(currentUser), eq(context), any(), any(), eq("session-token"), currentTurnContentCaptor.capture(), any());
        String latestCurrentTurnContent = currentTurnContentCaptor.getAllValues().get(currentTurnContentCaptor.getAllValues().size() - 1);
        assertThat(latestCurrentTurnContent)
                .contains("用户已显式选择 Skill：" + slashCommand)
                .contains(expectedInstruction);
    }

    private HermesConversationSessionEntity buildSessionEntity() {
        HermesConversationSessionEntity entity = new HermesConversationSessionEntity();
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
