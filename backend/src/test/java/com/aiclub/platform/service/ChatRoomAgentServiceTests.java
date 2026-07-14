package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatRoomAgentConfigEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentTaskEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentToolPolicyEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatRoomAgentConfigSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskSummary;
import com.aiclub.platform.dto.ChatRoomAgentToolPolicySummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantActionSummary;
import com.aiclub.platform.dto.AssistantChatRoomAgentTaskResult;
import com.aiclub.platform.dto.AssistantSelectionCard;
import com.aiclub.platform.dto.AssistantSelectionOption;
import com.aiclub.platform.dto.AssistantToolExecutionPolicy;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.request.AssistantActionExecutedRequest;
import com.aiclub.platform.dto.request.AssistantSelectionRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentConfigRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentToolPoliciesRequest;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomAgentConfigRepository;
import com.aiclub.platform.repository.ChatRoomAgentTaskEventRepository;
import com.aiclub.platform.repository.ChatRoomAgentTaskRepository;
import com.aiclub.platform.repository.ChatRoomAgentToolPolicyRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证聊天室 Agent 配置、工具授权和持久化任务创建规则。
 */
@ExtendWith(MockitoExtension.class)
class ChatRoomAgentServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private ChatRoomService chatRoomService;

    @Mock
    private ChatRoomRepository chatRoomRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ChatRoomAgentConfigRepository configRepository;

    @Mock
    private ChatRoomAgentToolPolicyRepository toolPolicyRepository;

    @Mock
    private ChatRoomAgentTaskRepository taskRepository;

    @Mock
    private ChatRoomAgentTaskEventRepository taskEventRepository;

    @Mock
    private PlatformToolRegistry platformToolRegistry;

    @Mock
    private ChatWebSocketPushService chatWebSocketPushService;

    @Mock
    private ChatRoomAgentQueuePublisher chatRoomAgentQueuePublisher;

    @Mock
    private ChatMessageRepository chatMessageRepository;

    @Mock
    private ChatAssistantService chatAssistantService;

    @Test
    @DisplayName("生产构造器必须显式标记为 Spring 注入入口")
    void shouldMarkProductionConstructorAsAutowiredBecauseTestConstructorAlsoExists() throws Exception {
        Constructor<ChatRoomAgentService> constructor = ChatRoomAgentService.class.getConstructor(
                AuthService.class,
                ChatRoomService.class,
                ChatRoomRepository.class,
                UserRepository.class,
                ChatRoomAgentConfigRepository.class,
                ChatRoomAgentToolPolicyRepository.class,
                ChatRoomAgentTaskRepository.class,
                ChatRoomAgentTaskEventRepository.class,
                PlatformToolRegistry.class,
                ChatWebSocketPushService.class,
                ChatMessageRepository.class,
                ChatAssistantService.class,
                ChatRoomAgentQueuePublisher.class,
                com.fasterxml.jackson.databind.ObjectMapper.class
        );

        assertThat(constructor.getAnnotation(Autowired.class)).isNotNull();
    }

    @Test
    @DisplayName("任务调度入口必须使用可写事务领取 PENDING 任务")
    void shouldRunPendingTasksInWritableTransaction() throws Exception {
        Method method = ChatRoomAgentService.class.getMethod("runPendingTasks");
        Transactional transactional = method.getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(transactional.readOnly()).isFalse();
    }

    @Test
    void shouldAllowRoomOwnerToUpdateAgentConfigAndCaptureAuthorization() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ChatRoomEntity room = room(owner);

        when(authService.currentUser()).thenReturn(currentUser(5L));
        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(userRepository.findById(5L)).thenReturn(Optional.of(owner));
        when(configRepository.findByRoom_Id(41L)).thenReturn(Optional.empty());
        when(configRepository.save(any(ChatRoomAgentConfigEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomAgentConfigSummary summary = service.updateConfig(41L, new UpdateChatRoomAgentConfigRequest(
                true,
                "房间 Assistant",
                "你是这个房间的研发协作同事。",
                true,
                true,
                true,
                12,
                45,
                List.of("阻塞", "失败"),
                15,
                List.of("FAILED", "CANCELED")
        ));

        ArgumentCaptor<ChatRoomAgentConfigEntity> captor = ArgumentCaptor.forClass(ChatRoomAgentConfigEntity.class);
        verify(configRepository).save(captor.capture());
        assertThat(summary.enabled()).isTrue();
        assertThat(summary.displayName()).isEqualTo("房间 Assistant");
        assertThat(summary.authorizedByUserId()).isEqualTo(5L);
        assertThat(summary.proactiveSummaryMessageThreshold()).isEqualTo(12);
        assertThat(summary.keywordWatchTerms()).containsExactly("阻塞", "失败");
        assertThat(summary.taskStatusCallbackStatuses()).containsExactly("FAILED", "CANCELED");
        assertThat(captor.getValue().isKeywordWatchEnabled()).isTrue();
    }

    @Test
    void shouldRejectNonOwnerUpdatingToolPolicies() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ChatRoomEntity room = room(owner);

        when(authService.currentUser()).thenReturn(currentUser(8L));
        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));

        assertThatThrownBy(() -> service.updateToolPolicies(41L, new UpdateChatRoomAgentToolPoliciesRequest(List.of())))
                .isInstanceOf(com.aiclub.platform.exception.ForbiddenException.class)
                .hasMessageContaining("只有房主可以维护聊天室 Agent");
    }

    @Test
    void shouldPersistOnlyWhitelistedWriteToolAutoExecutionPolicy() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ChatRoomEntity room = room(owner);

        when(authService.currentUser()).thenReturn(currentUser(5L));
        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(platformToolRegistry.requireDefinition("execution_task.create")).thenReturn(tool("execution_task.create", false, "MEDIUM"));
        when(platformToolRegistry.requireDefinition("execution_task.cancel")).thenReturn(tool("execution_task.cancel", false, "MEDIUM"));
        when(toolPolicyRepository.save(any(ChatRoomAgentToolPolicyEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<ChatRoomAgentToolPolicySummary> summaries = service.updateToolPolicies(41L, new UpdateChatRoomAgentToolPoliciesRequest(List.of(
                new UpdateChatRoomAgentToolPoliciesRequest.ToolPolicyItem("execution_task.create", true, true),
                new UpdateChatRoomAgentToolPoliciesRequest.ToolPolicyItem("execution_task.cancel", true, true)
        )));

        assertThat(summaries).extracting(ChatRoomAgentToolPolicySummary::toolCode)
                .containsExactly("execution_task.create", "execution_task.cancel");
        assertThat(summaries).extracting(ChatRoomAgentToolPolicySummary::autoExecute)
                .containsExactly(true, false);
    }

    @Test
    void shouldCreatePendingMentionTaskAndInitialEvent() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ChatRoomEntity room = room(owner);
        ChatRoomAgentConfigEntity config = new ChatRoomAgentConfigEntity();
        config.setRoom(room);
        config.setEnabled(true);
        config.setAuthorizedByUser(owner);

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(configRepository.findByRoom_Id(41L)).thenReturn(Optional.of(config));
        when(userRepository.findById(5L)).thenReturn(Optional.of(owner));
        when(taskRepository.save(any(ChatRoomAgentTaskEntity.class))).thenAnswer(invocation -> {
            ChatRoomAgentTaskEntity task = invocation.getArgument(0);
            task.setId(501L);
            return task;
        });
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomAgentTaskEntity task = service.createMentionTask(41L, 102L, 101L, 5L);

        assertThat(task.getId()).isEqualTo(501L);
        assertThat(task.getStatus()).isEqualTo(ChatRoomAgentService.TASK_PENDING);
        assertThat(task.getTriggerType()).isEqualTo(ChatRoomAgentService.TRIGGER_MENTION);
        verify(taskEventRepository).save(any());
        verify(chatWebSocketPushService).broadcastAgentTaskCreated(41L, service.toTaskSummary(task));
        verify(chatRoomAgentQueuePublisher).publishAfterCommit(501L);
    }

    @Test
    void shouldCreateKeywordTaskWhenMessageMatchesConfiguredTerm() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ChatRoomEntity room = room(owner);
        ChatRoomAgentConfigEntity config = new ChatRoomAgentConfigEntity();
        config.setRoom(room);
        config.setEnabled(true);
        config.setKeywordWatchEnabled(true);
        config.setKeywordWatchTermsJson("[\"阻塞\",\"失败\"]");
        config.setKeywordWatchCooldownMinutes(10);
        config.setAuthorizedByUser(owner);
        ChatMessageEntity message = message(room, owner, 301L, "支付联调阻塞了");

        when(chatRoomRepository.findById(41L)).thenReturn(Optional.of(room));
        when(configRepository.findByRoom_Id(41L)).thenReturn(Optional.of(config));
        when(chatMessageRepository.findById(301L)).thenReturn(Optional.of(message));
        when(taskRepository.existsByTriggerTypeAndSourceRef(ChatRoomAgentService.TRIGGER_KEYWORD, "keyword:message:301")).thenReturn(false);
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> {
            ChatMessageEntity entity = invocation.getArgument(0);
            entity.setId(401L);
            return entity;
        });
        when(taskRepository.save(any(ChatRoomAgentTaskEntity.class))).thenAnswer(invocation -> {
            ChatRoomAgentTaskEntity task = invocation.getArgument(0);
            task.setId(601L);
            return task;
        });
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(configRepository.save(any(ChatRoomAgentConfigEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomAgentTaskSummary summary = service.handleUserMessageCreated(41L, 301L);

        assertThat(summary).isNotNull();
        assertThat(summary.triggerType()).isEqualTo(ChatRoomAgentService.TRIGGER_KEYWORD);
        assertThat(summary.sourceRef()).isEqualTo("keyword:message:301");
        assertThat(summary.payloadJson()).contains("阻塞");
        verify(chatRoomAgentQueuePublisher).publishAfterCommit(601L);
    }

    @Test
    void shouldRepublishPendingTasksForRabbitCompensation() {
        ChatRoomAgentService service = buildService();
        ChatRoomAgentTaskEntity pendingTask = new ChatRoomAgentTaskEntity();
        pendingTask.setId(701L);

        when(taskRepository.findTop10ByStatusOrderByCreatedAtAscIdAsc(ChatRoomAgentService.TASK_PENDING))
                .thenReturn(List.of(pendingTask));

        service.republishPendingTasks();

        verify(chatRoomAgentQueuePublisher).publishNow(701L);
    }

    @Test
    void shouldCreateTaskStatusCallbackTaskForProjectRooms() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(5L);
        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("支付项目");
        ChatRoomEntity room = room(owner);
        room.setProject(project);
        room.setVisibilityType(ChatRoomService.VISIBILITY_PROJECT);
        ChatRoomAgentConfigEntity config = new ChatRoomAgentConfigEntity();
        config.setRoom(room);
        config.setEnabled(true);
        config.setTaskStatusCallbackEnabled(true);
        config.setTaskStatusCallbackStatusesJson("[\"SUCCESS\",\"FAILED\"]");
        config.setAuthorizedByUser(owner);
        ExecutionTaskEntity executionTask = new ExecutionTaskEntity();
        executionTask.setId(9001L);
        executionTask.setProject(project);
        executionTask.setTitle("修复支付回调");
        executionTask.setScenarioCode("DEVELOPMENT_IMPLEMENTATION");
        executionTask.setStatus("FAILED");
        executionTask.setLatestSummary("单测失败");

        when(configRepository.findByEnabledTrueAndTaskStatusCallbackEnabledTrueAndRoom_Project_Id(12L))
                .thenReturn(List.of(config));
        when(taskRepository.existsByTriggerTypeAndSourceRef(ChatRoomAgentService.TRIGGER_TASK_STATUS, "execution-task:9001:status:FAILED"))
                .thenReturn(false);
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> {
            ChatMessageEntity entity = invocation.getArgument(0);
            entity.setId(901L);
            return entity;
        });
        when(taskRepository.save(any(ChatRoomAgentTaskEntity.class))).thenAnswer(invocation -> {
            ChatRoomAgentTaskEntity task = invocation.getArgument(0);
            task.setId(902L);
            return task;
        });
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        List<ChatRoomAgentTaskSummary> summaries = service.handleExecutionTaskStatusChanged(executionTask, "FAILED");

        assertThat(summaries).hasSize(1);
        assertThat(summaries.get(0).triggerType()).isEqualTo(ChatRoomAgentService.TRIGGER_TASK_STATUS);
        assertThat(summaries.get(0).sourceRef()).isEqualTo("execution-task:9001:status:FAILED");
        assertThat(summaries.get(0).payloadJson()).contains("单测失败");
        verify(chatRoomAgentQueuePublisher).publishAfterCommit(902L);
    }

    @Test
    void shouldSkipRunWhenPendingTaskWasAlreadyClaimed() {
        ChatRoomAgentService service = buildService();

        when(taskRepository.claimPendingTask(any(), anyString(), anyString(), anyString(), any()))
                .thenReturn(0);

        service.runTask(501L);

        verify(taskRepository, never()).findById(any());
    }

    @Test
    void shouldPropagateRunFailureForRabbitRetry() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity assistant = message(room, owner, 601L, "");
        assistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatMessageEntity trigger = message(room, owner, 602L, "Assistant 帮我看一下");
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setId(603L);
        task.setRoom(room);
        task.setAssistantMessage(assistant);
        task.setTriggerMessage(trigger);
        task.setTriggerType(ChatRoomAgentService.TRIGGER_MENTION);
        task.setStatus(ChatRoomAgentService.TASK_RUNNING);

        when(taskRepository.claimPendingTask(any(), anyString(), anyString(), anyString(), any())).thenReturn(1);
        when(taskRepository.findById(603L)).thenReturn(Optional.of(task));
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        org.mockito.Mockito.doThrow(new IllegalStateException("Assistant 暂不可用"))
                .when(chatAssistantService)
                .startAssistantReply(eq(room.getId()), eq(assistant.getId()), eq(trigger.getId()), any(AssistantToolExecutionPolicy.class));

        assertThatThrownBy(() -> service.runTask(603L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Assistant 暂不可用");

        verify(taskRepository, never()).save(org.mockito.ArgumentMatchers.argThat(savedTask ->
                ChatRoomAgentService.TASK_ERROR.equals(savedTask.getStatus())));
    }

    @Test
    void shouldPassRoomToolPolicyToAssistantTaskRuntimeAndBroadcastPendingActions() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity assistant = message(room, owner, 601L, "");
        assistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatMessageEntity trigger = message(room, owner, 602L, "Assistant 帮我创建执行任务");
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setId(603L);
        task.setRoom(room);
        task.setAssistantMessage(assistant);
        task.setTriggerMessage(trigger);
        task.setAuthorizedByUser(owner);
        task.setTriggerType(ChatRoomAgentService.TRIGGER_MENTION);
        task.setStatus(ChatRoomAgentService.TASK_RUNNING);
        ChatRoomAgentToolPolicyEntity readPolicy = new ChatRoomAgentToolPolicyEntity();
        readPolicy.setToolCode(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH);
        readPolicy.setEnabled(true);
        readPolicy.setAutoExecute(true);
        ChatRoomAgentToolPolicyEntity writePolicy = new ChatRoomAgentToolPolicyEntity();
        writePolicy.setToolCode(PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE);
        writePolicy.setEnabled(true);
        writePolicy.setAutoExecute(false);
        AssistantActionSummary action = new AssistantActionSummary(
                "CREATE_EXECUTION_TASK",
                "发起执行任务",
                "确认后会基于当前工作项创建执行中心任务。",
                true,
                Map.of("projectId", 41L, "workItemId", 99L)
        );

        when(taskRepository.claimPendingTask(any(), anyString(), anyString(), anyString(), any())).thenReturn(1);
        when(taskRepository.findById(603L)).thenReturn(Optional.of(task));
        when(toolPolicyRepository.findByRoom_IdOrderByToolCodeAsc(41L)).thenReturn(List.of(readPolicy, writePolicy));
        when(platformToolRegistry.requireDefinition(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH))
                .thenReturn(tool(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH, true, "LOW"));
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatAssistantService.startAssistantReply(
                eq(room.getId()),
                eq(assistant.getId()),
                eq(trigger.getId()),
                any(AssistantToolExecutionPolicy.class)
        )).thenReturn(new AssistantChatRoomAgentTaskResult("需要确认后执行。", List.of(action), List.of(), List.of()));

        service.runTask(603L);

        org.mockito.ArgumentCaptor<AssistantToolExecutionPolicy> policyCaptor = org.mockito.ArgumentCaptor.forClass(AssistantToolExecutionPolicy.class);
        verify(chatAssistantService).startAssistantReply(eq(room.getId()), eq(assistant.getId()), eq(trigger.getId()), policyCaptor.capture());
        assertThat(policyCaptor.getValue().taskId()).isEqualTo(603L);
        assertThat(policyCaptor.getValue().enabledToolCodes()).containsExactlyInAnyOrder(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE
        );
        assertThat(policyCaptor.getValue().autoExecutableToolCodes()).containsExactly(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH);
        verify(chatWebSocketPushService).broadcastAgentActionPending(41L, 603L, 601L, List.of(action));
    }

    @Test
    void shouldPersistAssistantRuntimeCardsIntoTaskPayloadAndBroadcastSelectionPending() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity assistant = message(room, owner, 601L, "");
        assistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatMessageEntity trigger = message(room, owner, 602L, "Assistant 帮我找需求");
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setId(603L);
        task.setRoom(room);
        task.setAssistantMessage(assistant);
        task.setTriggerMessage(trigger);
        task.setAuthorizedByUser(owner);
        task.setTriggerType(ChatRoomAgentService.TRIGGER_MENTION);
        task.setStatus(ChatRoomAgentService.TASK_RUNNING);
        AssistantActionSummary action = new AssistantActionSummary(
                "CREATE_EXECUTION_TASK",
                "发起执行任务",
                "确认后创建执行任务。",
                true,
                Map.of("projectId", 41L)
        );
        AssistantSelectionCard selectionCard = new AssistantSelectionCard(
                "workItem",
                "请选择需求",
                "命中了多个候选需求。",
                "继续创建执行任务",
                List.of(new AssistantSelectionOption("workItem", "WORK_ITEM", 99L, "支付回调", "需求 #99", "", 0.92, List.of("标题命中")))
        );

        when(taskRepository.claimPendingTask(any(), anyString(), anyString(), anyString(), any())).thenReturn(1);
        when(taskRepository.findById(603L)).thenReturn(Optional.of(task));
        when(toolPolicyRepository.findByRoom_IdOrderByToolCodeAsc(41L)).thenReturn(List.of());
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(chatAssistantService.startAssistantReply(eq(41L), eq(601L), eq(602L), any(AssistantToolExecutionPolicy.class)))
                .thenReturn(new AssistantChatRoomAgentTaskResult("请选择需求。", List.of(action), List.of(selectionCard), List.of()));

        service.runTask(603L);

        assertThat(task.getPayloadJson()).contains("assistantActions", "assistantSelectionCards", "支付回调");
        verify(chatWebSocketPushService).broadcastAgentActionPending(41L, 603L, 601L, List.of(action));
        verify(chatWebSocketPushService).broadcastAgentSelectionPending(41L, 603L, 601L, List.of(selectionCard));
    }

    @Test
    void shouldMarkChatAgentActionExecutedAndCanceledWithExistingActionRequestPayload() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity assistant = message(room, owner, 601L, "");
        assistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setId(603L);
        task.setRoom(room);
        task.setAssistantMessage(assistant);
        task.setPayloadJson("{\"assistantActions\":[{\"type\":\"CREATE_EXECUTION_TASK\",\"title\":\"发起执行任务\",\"description\":\"\",\"requiresConfirm\":true,\"params\":{}}]}");

        when(taskRepository.findById(603L)).thenReturn(Optional.of(task));
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(taskRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.markActionExecuted(41L, 603L, new AssistantActionExecutedRequest("CREATE_EXECUTION_TASK:0:key"));
        service.cancelAction(41L, 603L, new AssistantActionExecutedRequest("CREATE_EXECUTION_TASK:0:key"));

        assertThat(task.getPayloadJson()).contains("actionStatuses", "canceled");
        verify(chatWebSocketPushService).broadcastAgentActionExecuted(eq(41L), eq(603L), eq(601L), any(AssistantActionSummary.class), eq("executed"), eq("CREATE_EXECUTION_TASK:0:key"));
        verify(chatWebSocketPushService).broadcastAgentActionExecuted(eq(41L), eq(603L), eq(601L), any(AssistantActionSummary.class), eq("canceled"), eq("CREATE_EXECUTION_TASK:0:key"));
    }

    @Test
    void shouldCreateFollowupTaskWhenUserSelectsCandidateCard() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity originalAssistant = message(room, owner, 601L, "");
        originalAssistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatRoomAgentTaskEntity originalTask = new ChatRoomAgentTaskEntity();
        originalTask.setId(603L);
        originalTask.setRoom(room);
        originalTask.setAssistantMessage(originalAssistant);
        originalTask.setAuthorizedByUser(owner);
        originalTask.setPayloadJson("{}");

        when(taskRepository.findById(603L)).thenReturn(Optional.of(originalTask));
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> {
            ChatMessageEntity entity = invocation.getArgument(0);
            entity.setId(entity.getId() == null ? 701L : entity.getId());
            return entity;
        });
        when(taskRepository.save(any(ChatRoomAgentTaskEntity.class))).thenAnswer(invocation -> {
            ChatRoomAgentTaskEntity task = invocation.getArgument(0);
            if (task.getId() == null) {
                task.setId(704L);
            }
            return task;
        });
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomAgentTaskSummary followup = service.selectCandidate(
                41L,
                603L,
                new AssistantSelectionRequest("workItem", "WORK_ITEM", 99L, "继续创建执行任务")
        );

        assertThat(followup.id()).isEqualTo(704L);
        assertThat(followup.triggerType()).isEqualTo(ChatRoomAgentService.TRIGGER_SELECTION);
        assertThat(followup.payloadJson()).contains("WORK_ITEM", "sourceTaskId", "99");
        verify(chatRoomAgentQueuePublisher).publishAfterCommit(704L);
        verify(chatWebSocketPushService).broadcastAgentSelectionResolved(41L, 603L, 601L, "workItem:WORK_ITEM:99", "selected");
    }

    @Test
    void shouldKeepSourceSelectionCardsOutOfFollowupDisplayPayload() {
        ChatRoomAgentService service = buildService();
        UserEntity owner = user(1L);
        ChatRoomEntity room = room(owner);
        ChatMessageEntity originalAssistant = message(room, owner, 601L, "");
        originalAssistant.setRole(ChatRoomService.ROLE_ASSISTANT);
        ChatRoomAgentTaskEntity originalTask = new ChatRoomAgentTaskEntity();
        originalTask.setId(603L);
        originalTask.setRoom(room);
        originalTask.setAssistantMessage(originalAssistant);
        originalTask.setAuthorizedByUser(owner);
        originalTask.setPayloadJson("{\"assistantSelectionCards\":[{\"slot\":\"project\",\"title\":\"请选择项目\",\"description\":\"\",\"resumeQuestion\":\"继续\",\"options\":[{\"slot\":\"project\",\"entityType\":\"PROJECT\",\"entityId\":11,\"title\":\"示例项目\",\"subtitle\":\"\",\"route\":\"\",\"matchScore\":0.9,\"matchReasons\":[]}]}]}");

        when(taskRepository.findById(603L)).thenReturn(Optional.of(originalTask));
        when(chatMessageRepository.save(any(ChatMessageEntity.class))).thenAnswer(invocation -> {
            ChatMessageEntity entity = invocation.getArgument(0);
            entity.setId(entity.getId() == null ? 701L : entity.getId());
            return entity;
        });
        when(taskRepository.save(any(ChatRoomAgentTaskEntity.class))).thenAnswer(invocation -> {
            ChatRoomAgentTaskEntity task = invocation.getArgument(0);
            if (task.getId() == null) {
                task.setId(704L);
            }
            return task;
        });
        when(taskEventRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        ChatRoomAgentTaskSummary followup = service.selectCandidate(
                41L,
                603L,
                new AssistantSelectionRequest("project", "PROJECT", 11L, "继续查询项目")
        );

        assertThat(followup.payloadJson()).doesNotContain("\"assistantSelectionCards\"");
        assertThat(followup.payloadJson()).contains("\"sourceAssistantSelectionCards\"");
    }

    private ChatRoomAgentService buildService() {
        return new ChatRoomAgentService(
                authService,
                chatRoomService,
                chatRoomRepository,
                userRepository,
                configRepository,
                toolPolicyRepository,
                taskRepository,
                taskEventRepository,
                platformToolRegistry,
                chatWebSocketPushService,
                chatMessageRepository,
                chatAssistantService,
                chatRoomAgentQueuePublisher,
                new com.fasterxml.jackson.databind.ObjectMapper()
        );
    }

    private ChatMessageEntity message(ChatRoomEntity room, UserEntity sender, Long id, String content) {
        ChatMessageEntity entity = new ChatMessageEntity();
        entity.setId(id);
        entity.setRoom(room);
        entity.setSenderUser(sender);
        entity.setRole(ChatRoomService.ROLE_USER);
        entity.setSenderUsernameSnapshot(sender.getUsername());
        entity.setSenderNameSnapshot(sender.getNickname());
        entity.setContent(content);
        entity.setStatus(ChatRoomService.STATUS_DONE);
        return entity;
    }

    private CurrentUserInfo currentUser(Long id) {
        return new CurrentUserInfo(id, "user-" + id, "用户" + id, "", "", "", "", true, List.of(), List.of(), List.of("chat:view", "chat:manage", "hermes:chat"), List.of());
    }

    private UserEntity user(Long id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setUsername("user-" + id);
        user.setNickname("用户" + id);
        user.setEnabled(true);
        user.setPasswordHash("hash");
        return user;
    }

    private ChatRoomEntity room(UserEntity owner) {
        ChatRoomEntity room = new ChatRoomEntity();
        room.setId(41L);
        room.setTitle("研发作战室");
        room.setCreatorUser(owner);
        room.setVisibilityType(ChatRoomService.VISIBILITY_GLOBAL_INVITE);
        return room;
    }

    private PlatformToolDefinition tool(String code, boolean readOnly, String riskLevel) {
        return new PlatformToolDefinition(code, code, "TEST", code, readOnly, riskLevel, "chat:view", !readOnly, Map.of(), Map.of());
    }
}
