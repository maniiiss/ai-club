package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ChatMessageEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentConfigEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentTaskEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentTaskEventEntity;
import com.aiclub.platform.domain.model.ChatRoomAgentToolPolicyEntity;
import com.aiclub.platform.domain.model.ChatRoomEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ChatRoomAgentConfigSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskEventSummary;
import com.aiclub.platform.dto.ChatRoomAgentTaskSummary;
import com.aiclub.platform.dto.ChatRoomAgentToolPolicySummary;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesChatRoomAgentTaskResult;
import com.aiclub.platform.dto.HermesToolExecutionPolicy;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentConfigRequest;
import com.aiclub.platform.dto.request.UpdateChatRoomAgentToolPoliciesRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ChatMessageRepository;
import com.aiclub.platform.repository.ChatRoomAgentConfigRepository;
import com.aiclub.platform.repository.ChatRoomAgentTaskEventRepository;
import com.aiclub.platform.repository.ChatRoomAgentTaskRepository;
import com.aiclub.platform.repository.ChatRoomAgentToolPolicyRepository;
import com.aiclub.platform.repository.ChatRoomRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 聊天室房间级 Agent 服务。
 * 业务意图：统一管理房间 Hermes 身份、工具授权、持久化任务和任务事件。
 */
@Service
@Transactional(readOnly = true)
public class ChatRoomAgentService {

    private static final Logger LOGGER = LoggerFactory.getLogger(ChatRoomAgentService.class);

    public static final String TRIGGER_MENTION = "MENTION";
    public static final String TRIGGER_SUMMARY = "SUMMARY";
    public static final String TRIGGER_KEYWORD = "KEYWORD";
    public static final String TRIGGER_TASK_STATUS = "TASK_STATUS";

    public static final String TASK_PENDING = "PENDING";
    public static final String TASK_RETRYING = "RETRYING";
    public static final String TASK_RUNNING = "RUNNING";
    public static final String TASK_DONE = "DONE";
    public static final String TASK_ERROR = "ERROR";
    public static final String TASK_CANCELED = "CANCELED";

    private static final Set<String> AUTO_WRITE_TOOL_ALLOWLIST = Set.of(
            PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE,
            PlatformToolRegistry.TOOL_REPO_SCAN_START,
            PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT,
            PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT
    );
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AuthService authService;
    private final ChatRoomService chatRoomService;
    private final ChatRoomRepository chatRoomRepository;
    private final UserRepository userRepository;
    private final ChatRoomAgentConfigRepository configRepository;
    private final ChatRoomAgentToolPolicyRepository toolPolicyRepository;
    private final ChatRoomAgentTaskRepository taskRepository;
    private final ChatRoomAgentTaskEventRepository taskEventRepository;
    private final PlatformToolRegistry platformToolRegistry;
    private final ChatWebSocketPushService chatWebSocketPushService;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatHermesService chatHermesService;
    private final ChatRoomAgentQueuePublisher queuePublisher;
    private final ObjectMapper objectMapper;

    @Autowired
    public ChatRoomAgentService(AuthService authService,
                                @Lazy ChatRoomService chatRoomService,
                                ChatRoomRepository chatRoomRepository,
                                UserRepository userRepository,
                                ChatRoomAgentConfigRepository configRepository,
                                ChatRoomAgentToolPolicyRepository toolPolicyRepository,
                                ChatRoomAgentTaskRepository taskRepository,
                                ChatRoomAgentTaskEventRepository taskEventRepository,
                                PlatformToolRegistry platformToolRegistry,
                                ChatWebSocketPushService chatWebSocketPushService,
                                ChatMessageRepository chatMessageRepository,
                                @Lazy ChatHermesService chatHermesService,
                                ChatRoomAgentQueuePublisher queuePublisher,
                                ObjectMapper objectMapper) {
        this.authService = authService;
        this.chatRoomService = chatRoomService;
        this.chatRoomRepository = chatRoomRepository;
        this.userRepository = userRepository;
        this.configRepository = configRepository;
        this.toolPolicyRepository = toolPolicyRepository;
        this.taskRepository = taskRepository;
        this.taskEventRepository = taskEventRepository;
        this.platformToolRegistry = platformToolRegistry;
        this.chatWebSocketPushService = chatWebSocketPushService;
        this.chatMessageRepository = chatMessageRepository;
        this.chatHermesService = chatHermesService;
        this.queuePublisher = queuePublisher;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    /**
     * 单元测试轻量构造器。
     */
    public ChatRoomAgentService(AuthService authService,
                                ChatRoomService chatRoomService,
                                ChatRoomRepository chatRoomRepository,
                                UserRepository userRepository,
                                ChatRoomAgentConfigRepository configRepository,
                                ChatRoomAgentToolPolicyRepository toolPolicyRepository,
                                ChatRoomAgentTaskRepository taskRepository,
                                ChatRoomAgentTaskEventRepository taskEventRepository,
                                PlatformToolRegistry platformToolRegistry,
                                ChatWebSocketPushService chatWebSocketPushService) {
        this(authService, chatRoomService, chatRoomRepository, userRepository, configRepository, toolPolicyRepository,
                taskRepository, taskEventRepository, platformToolRegistry, chatWebSocketPushService,
                null, null, null, new ObjectMapper());
    }

    public ChatRoomAgentConfigSummary getConfig(Long roomId) {
        chatRoomService.requireAccessibleRoom(roomId);
        ChatRoomEntity room = requireRoom(roomId);
        return toConfigSummary(resolveConfig(room));
    }

    @Transactional
    public ChatRoomAgentConfigSummary updateConfig(Long roomId, UpdateChatRoomAgentConfigRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        ChatRoomEntity room = requireRoom(roomId);
        requireRoomOwner(room, currentUser.id());
        UserEntity user = userRepository.findById(currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
        ChatRoomAgentConfigEntity config = resolveConfig(room);
        config.setEnabled(!Boolean.FALSE.equals(request.enabled()));
        config.setDisplayName(trimToMax(defaultString(request.displayName()).isBlank() ? "Hermes" : request.displayName(), 100));
        config.setSystemInstruction(trimToMax(defaultString(request.systemInstruction()), 4000));
        config.setProactiveSummaryEnabled(Boolean.TRUE.equals(request.proactiveSummaryEnabled()));
        config.setKeywordWatchEnabled(Boolean.TRUE.equals(request.keywordWatchEnabled()));
        config.setTaskStatusCallbackEnabled(Boolean.TRUE.equals(request.taskStatusCallbackEnabled()));
        config.setProactiveSummaryMessageThreshold(clampInt(request.proactiveSummaryMessageThreshold(), 1, 200, 20));
        config.setProactiveSummaryMinIntervalMinutes(clampInt(request.proactiveSummaryMinIntervalMinutes(), 1, 1440, 60));
        config.setKeywordWatchTermsJson(writeStringList(request.keywordWatchTerms()));
        config.setKeywordWatchCooldownMinutes(clampInt(request.keywordWatchCooldownMinutes(), 0, 1440, 10));
        config.setTaskStatusCallbackStatusesJson(writeStringList(normalizeStatusList(request.taskStatusCallbackStatuses())));
        config.setAuthorizedByUser(user);
        config.setAuthorizedAt(LocalDateTime.now());
        ChatRoomAgentConfigEntity saved = configRepository.save(config);
        ChatRoomAgentConfigSummary summary = toConfigSummary(saved);
        chatWebSocketPushService.broadcastAgentConfigUpdated(roomId, summary);
        return summary;
    }

    public List<ChatRoomAgentToolPolicySummary> listToolPolicies(Long roomId) {
        chatRoomService.requireAccessibleRoom(roomId);
        Map<String, ChatRoomAgentToolPolicyEntity> existing = toolPolicyRepository.findByRoom_IdOrderByToolCodeAsc(roomId).stream()
                .collect(java.util.stream.Collectors.toMap(ChatRoomAgentToolPolicyEntity::getToolCode, item -> item));
        return platformToolRegistry.listDefinitions().stream()
                .sorted(Comparator.comparing(PlatformToolDefinition::code))
                .map(definition -> toToolPolicySummary(definition, existing.get(definition.code())))
                .toList();
    }

    @Transactional
    public List<ChatRoomAgentToolPolicySummary> updateToolPolicies(Long roomId, UpdateChatRoomAgentToolPoliciesRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        ChatRoomEntity room = requireRoom(roomId);
        requireRoomOwner(room, currentUser.id());
        UserEntity user = userRepository.findById(currentUser.id())
                .orElseGet(() -> room.getCreatorUser());
        List<ChatRoomAgentToolPolicySummary> summaries = request.tools().stream()
                .map(item -> saveToolPolicy(room, user, item))
                .toList();
        chatWebSocketPushService.broadcastAgentToolsUpdated(roomId, summaries);
        return summaries;
    }

    @Transactional
    public ChatRoomAgentTaskEntity createMentionTask(Long roomId, Long assistantMessageId, Long triggerMessageId, Long triggerUserId) {
        ChatRoomEntity room = requireRoom(roomId);
        ChatRoomAgentConfigEntity config = resolveConfig(room);
        UserEntity authorizedBy = config.getAuthorizedByUser() == null ? room.getCreatorUser() : config.getAuthorizedByUser();
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setRoom(room);
        task.setAssistantMessage(resolveMessage(assistantMessageId));
        task.setTriggerMessage(resolveMessage(triggerMessageId));
        task.setTriggerUser(resolveUser(triggerUserId));
        task.setAuthorizedByUser(authorizedBy);
        task.setTriggerType(TRIGGER_MENTION);
        task.setStatus(config.isEnabled() ? TASK_PENDING : TASK_ERROR);
        task.setSource("@hermes");
        task.setSourceRef("mention:message:" + triggerMessageId);
        task.setPayloadJson(writePayload(Map.of("triggerMessageId", triggerMessageId == null ? "" : triggerMessageId)));
        task.setErrorMessage(config.isEnabled() ? "" : "聊天室 Agent 已关闭");
        ChatRoomAgentTaskEntity saved = taskRepository.save(task);
        if (saved.getAssistantMessage() != null) {
            saved.getAssistantMessage().setAgentTask(saved);
            if (chatMessageRepository != null) {
                chatMessageRepository.save(saved.getAssistantMessage());
            }
        }
        appendEvent(saved, config.isEnabled() ? "TASK_CREATED" : "TASK_REJECTED",
                config.isEnabled() ? "Hermes 任务已进入队列" : "聊天室 Agent 已关闭", Map.of());
        chatWebSocketPushService.broadcastAgentTaskCreated(roomId, toTaskSummary(saved));
        publishTaskIfPending(saved);
        return saved;
    }

    /**
     * 用户消息落库后评估主动触发源。
     * 业务意图：关键字监听和主动总结都以已提交的房间消息为事实来源，任务进入 RabbitMQ 后异步执行。
     */
    @Transactional
    public ChatRoomAgentTaskSummary handleUserMessageCreated(Long roomId, Long messageId) {
        ChatRoomEntity room = requireRoom(roomId);
        ChatRoomAgentConfigEntity config = resolveConfig(room);
        if (!config.isEnabled()) {
            return null;
        }
        ChatMessageEntity message = resolveMessage(messageId);
        if (message == null || !ChatRoomService.ROLE_USER.equalsIgnoreCase(defaultString(message.getRole()))) {
            return null;
        }
        ChatRoomAgentTaskEntity keywordTask = maybeCreateKeywordTask(room, config, message);
        if (keywordTask != null) {
            return toTaskSummary(keywordTask);
        }
        ChatRoomAgentTaskEntity summaryTask = maybeCreateSummaryTask(room, config, message);
        return summaryTask == null ? null : toTaskSummary(summaryTask);
    }

    /**
     * 执行中心任务状态变化后回写到绑定项目聊天室。
     * 业务意图：只让项目房间接收同项目执行任务状态，全局邀请房间不自动关联执行中心。
     */
    @Transactional
    public List<ChatRoomAgentTaskSummary> handleExecutionTaskStatusChanged(ExecutionTaskEntity executionTask, String status) {
        if (executionTask == null || executionTask.getProject() == null || executionTask.getProject().getId() == null) {
            return List.of();
        }
        String normalizedStatus = defaultString(status).toUpperCase(Locale.ROOT);
        if (normalizedStatus.isBlank()) {
            return List.of();
        }
        return configRepository.findByEnabledTrueAndTaskStatusCallbackEnabledTrueAndRoom_Project_Id(executionTask.getProject().getId()).stream()
                .filter(config -> readStringList(config.getTaskStatusCallbackStatusesJson()).stream()
                        .map(item -> item.toUpperCase(Locale.ROOT))
                        .anyMatch(normalizedStatus::equals))
                .map(config -> maybeCreateTaskStatusCallbackTask(config, executionTask, normalizedStatus))
                .filter(java.util.Objects::nonNull)
                .map(this::toTaskSummary)
                .toList();
    }

    public List<ChatRoomAgentTaskSummary> listTasks(Long roomId) {
        chatRoomService.requireAccessibleRoom(roomId);
        return taskRepository.findByRoom_IdOrderByCreatedAtDescIdDesc(roomId).stream()
                .map(this::toTaskSummary)
                .toList();
    }

    @Transactional
    public ChatRoomAgentTaskSummary retryTask(Long roomId, Long taskId) {
        ChatRoomAgentTaskEntity task = requireTask(roomId, taskId);
        task.setStatus(TASK_PENDING);
        task.setErrorMessage("");
        task.setFinishedAt(null);
        appendEvent(task, "TASK_RETRIED", "用户请求重试 Agent 任务", Map.of());
        return toTaskSummary(taskRepository.save(task));
    }

    @Transactional
    public ChatRoomAgentTaskSummary cancelTask(Long roomId, Long taskId) {
        ChatRoomAgentTaskEntity task = requireTask(roomId, taskId);
        task.setStatus(TASK_CANCELED);
        task.setFinishedAt(LocalDateTime.now());
        appendEvent(task, "TASK_CANCELED", "用户取消了 Agent 任务", Map.of());
        return toTaskSummary(taskRepository.save(task));
    }

    @Scheduled(fixedDelayString = "${platform.chat.agent.scheduler-fixed-delay-ms:5000}")
    @Transactional(readOnly = false)
    public void runPendingTasks() {
        republishPendingTasks();
    }

    /**
     * RabbitMQ 发布失败或服务重启后的补偿发布。
     */
    @Transactional(readOnly = false)
    public void republishPendingTasks() {
        List<ChatRoomAgentTaskEntity> tasks = taskRepository.findTop10ByStatusOrderByCreatedAtAscIdAsc(TASK_PENDING);
        for (ChatRoomAgentTaskEntity task : tasks) {
            if (task != null && task.getId() != null && queuePublisher != null) {
                queuePublisher.publishNow(task.getId());
            }
        }
    }

    @Transactional
    public void runTask(Long taskId) {
        runTask(taskId, false);
    }

    /**
     * 运行队列任务。
     * 业务意图：普通主队列消息只领取 PENDING；retry queue 回投消息才允许领取 RETRYING，避免重复主队列消息绕过延迟重试。
     */
    @Transactional
    public void runTask(Long taskId, boolean allowRetrying) {
        LocalDateTime startedAt = LocalDateTime.now();
        String retryingStatus = allowRetrying ? TASK_RETRYING : TASK_PENDING;
        int claimed = taskRepository.claimPendingTask(taskId, TASK_PENDING, retryingStatus, TASK_RUNNING, startedAt);
        if (claimed == 0) {
            return;
        }
        ChatRoomAgentTaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Agent 任务不存在"));
        appendEvent(task, "TASK_STARTED", "Hermes 开始处理房间任务", Map.of());
        chatWebSocketPushService.broadcastAgentTaskUpdated(task.getRoom().getId(), toTaskSummary(task));
        if (chatHermesService == null || task.getAssistantMessage() == null) {
            throw new IllegalStateException("聊天室 Agent 运行时尚未就绪");
        }
        HermesToolExecutionPolicy toolExecutionPolicy = buildToolExecutionPolicy(task);
        HermesChatRoomAgentTaskResult hermesResult;
        if (TRIGGER_MENTION.equals(task.getTriggerType())) {
            if (task.getTriggerMessage() == null) {
                throw new IllegalStateException("聊天室 Agent 触发消息缺失");
            }
            hermesResult = chatHermesService.startHermesReply(
                    task.getRoom().getId(),
                    task.getAssistantMessage().getId(),
                    task.getTriggerMessage().getId(),
                    toolExecutionPolicy
            );
        } else {
            hermesResult = chatHermesService.startAgentTaskReply(
                    task.getRoom().getId(),
                    task.getAssistantMessage().getId(),
                    buildTaskInstruction(task),
                    task.getAuthorizedByUser(),
                    toolExecutionPolicy
            );
        }
        task.setStatus(TASK_DONE);
        task.setFinishedAt(LocalDateTime.now());
        taskRepository.save(task);
        appendHermesRuntimeEvents(task, hermesResult);
        appendEvent(task, "TASK_DONE", "Hermes 已完成房间回复", Map.of());
        chatWebSocketPushService.broadcastAgentTaskUpdated(task.getRoom().getId(), toTaskSummary(task));
    }

    @Transactional
    public void markTaskError(Long taskId, String errorMessage) {
        ChatRoomAgentTaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Agent 任务不存在"));
        task.setStatus(TASK_ERROR);
        task.setErrorMessage(resolveErrorMessage(new IllegalStateException(errorMessage)));
        task.setFinishedAt(LocalDateTime.now());
        taskRepository.save(task);
        appendEvent(task, "TASK_ERROR", task.getErrorMessage(), Map.of());
        chatWebSocketPushService.broadcastAgentTaskUpdated(task.getRoom().getId(), toTaskSummary(task));
    }

    @Transactional
    public void markTaskRetrying(Long taskId, String errorMessage) {
        ChatRoomAgentTaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Agent 任务不存在"));
        task.setStatus(TASK_RETRYING);
        task.setErrorMessage(resolveErrorMessage(new IllegalStateException(errorMessage)));
        task.setStartedAt(null);
        task.setFinishedAt(null);
        taskRepository.save(task);
        appendEvent(task, "TASK_RETRYING", "Hermes 任务执行失败，已进入延迟重试队列", Map.of("errorMessage", task.getErrorMessage()));
        chatWebSocketPushService.broadcastAgentTaskUpdated(task.getRoom().getId(), toTaskSummary(task));
    }

    public boolean isAutoWriteToolAllowlisted(String toolCode) {
        return AUTO_WRITE_TOOL_ALLOWLIST.contains(defaultString(toolCode));
    }

    /**
     * 将房间工具授权固化为本轮 Hermes MCP 会话策略。
     * 业务意图：MCP bridge 执行工具时只能看到 Redis 热状态，因此这里必须把授权快照随任务一起传入。
     */
    private HermesToolExecutionPolicy buildToolExecutionPolicy(ChatRoomAgentTaskEntity task) {
        if (task == null || task.getRoom() == null || task.getRoom().getId() == null) {
            return HermesToolExecutionPolicy.empty();
        }
        List<ChatRoomAgentToolPolicyEntity> policies = toolPolicyRepository.findByRoom_IdOrderByToolCodeAsc(task.getRoom().getId());
        List<String> enabledToolCodes = policies.stream()
                .filter(ChatRoomAgentToolPolicyEntity::isEnabled)
                .map(ChatRoomAgentToolPolicyEntity::getToolCode)
                .map(this::defaultString)
                .filter(toolCode -> !toolCode.isBlank())
                .distinct()
                .toList();
        List<String> autoExecutableToolCodes = policies.stream()
                .filter(ChatRoomAgentToolPolicyEntity::isEnabled)
                .filter(ChatRoomAgentToolPolicyEntity::isAutoExecute)
                .map(ChatRoomAgentToolPolicyEntity::getToolCode)
                .map(this::defaultString)
                .filter(toolCode -> !toolCode.isBlank())
                .filter(toolCode -> {
                    PlatformToolDefinition definition = platformToolRegistry.requireDefinition(toolCode);
                    return definition.readOnly() || AUTO_WRITE_TOOL_ALLOWLIST.contains(toolCode);
                })
                .distinct()
                .toList();
        return new HermesToolExecutionPolicy(
                task.getId(),
                task.getRoom().getId(),
                task.getAssistantMessage() == null ? null : task.getAssistantMessage().getId(),
                task.getAuthorizedByUser() == null ? null : task.getAuthorizedByUser().getId(),
                enabledToolCodes,
                autoExecutableToolCodes
        );
    }

    /**
     * 将 Hermes 原生工具状态同步到聊天室任务事件。
     * 业务意图：工具确认卡片和自动执行结果都来自同一个 Hermes 状态机，聊天室只负责事件化展示。
     */
    private void appendHermesRuntimeEvents(ChatRoomAgentTaskEntity task, HermesChatRoomAgentTaskResult result) {
        if (task == null || result == null) {
            return;
        }
        if (!result.actions().isEmpty()) {
            appendEvent(task, "ACTION_PENDING", "Hermes 生成了待确认动作", Map.of("actionCount", result.actions().size()));
            chatWebSocketPushService.broadcastAgentActionPending(
                    task.getRoom().getId(),
                    task.getId(),
                    task.getAssistantMessage() == null ? null : task.getAssistantMessage().getId(),
                    result.actions()
            );
        }
        if (!result.selectionCards().isEmpty()) {
            appendEvent(task, "SELECTION_PENDING", "Hermes 生成了候选选择卡片", Map.of("selectionCount", result.selectionCards().size()));
        }
        for (Map<String, Object> execution : result.toolExecutions()) {
            String status = defaultString(String.valueOf(execution.getOrDefault("status", "")));
            if (!"SUCCESS".equalsIgnoreCase(status)) {
                continue;
            }
            HermesActionSummary executedAction = toExecutedAction(execution);
            appendEvent(task, "ACTION_EXECUTED", "Hermes 已自动执行授权工具", execution);
            chatWebSocketPushService.broadcastAgentActionExecuted(
                    task.getRoom().getId(),
                    task.getId(),
                    task.getAssistantMessage() == null ? null : task.getAssistantMessage().getId(),
                    executedAction,
                    "executed"
            );
        }
    }

    private HermesActionSummary toExecutedAction(Map<String, Object> execution) {
        String toolCode = defaultString(String.valueOf(execution.getOrDefault("toolCode", "")));
        String message = defaultString(String.valueOf(execution.getOrDefault("message", "")));
        Object arguments = execution.getOrDefault("arguments", Map.of());
        Map<String, Object> params = arguments instanceof Map<?, ?> rawMap
                ? rawMap.entrySet().stream()
                .filter(entry -> entry.getKey() != null)
                .collect(java.util.stream.Collectors.toMap(
                        entry -> String.valueOf(entry.getKey()),
                        Map.Entry::getValue,
                        (left, right) -> right,
                        LinkedHashMap::new
                ))
                : Map.of();
        return new HermesActionSummary(
                toolCode,
                toolCode.isBlank() ? "已执行工具" : "已执行 " + toolCode,
                message,
                false,
                params
        );
    }

    public ChatRoomAgentTaskSummary toTaskSummary(ChatRoomAgentTaskEntity task) {
        return new ChatRoomAgentTaskSummary(
                task.getId(),
                task.getRoom() == null ? null : task.getRoom().getId(),
                task.getAssistantMessage() == null ? null : task.getAssistantMessage().getId(),
                task.getTriggerMessage() == null ? null : task.getTriggerMessage().getId(),
                task.getTriggerUser() == null ? null : task.getTriggerUser().getId(),
                task.getAuthorizedByUser() == null ? null : task.getAuthorizedByUser().getId(),
                defaultString(task.getTriggerType()),
                defaultString(task.getStatus()),
                defaultString(task.getSource()),
                defaultString(task.getSourceRef()),
                defaultString(task.getPayloadJson()).isBlank() ? "{}" : defaultString(task.getPayloadJson()),
                defaultString(task.getErrorMessage()),
                formatTime(task.getStartedAt()),
                formatTime(task.getFinishedAt()),
                formatTime(task.getCreatedAt()),
                formatTime(task.getUpdatedAt())
        );
    }

    private ChatRoomAgentToolPolicySummary saveToolPolicy(ChatRoomEntity room,
                                                          UserEntity user,
                                                          UpdateChatRoomAgentToolPoliciesRequest.ToolPolicyItem item) {
        String toolCode = defaultString(item.toolCode());
        PlatformToolDefinition definition = platformToolRegistry.requireDefinition(toolCode);
        ChatRoomAgentToolPolicyEntity policy = toolPolicyRepository.findByRoom_IdAndToolCode(room.getId(), toolCode)
                .orElseGet(ChatRoomAgentToolPolicyEntity::new);
        policy.setRoom(room);
        policy.setToolCode(toolCode);
        policy.setEnabled(!Boolean.FALSE.equals(item.enabled()));
        boolean requestedAuto = Boolean.TRUE.equals(item.autoExecute());
        policy.setAutoExecute(resolveAutoExecuteAllowed(definition, requestedAuto));
        policy.setReadOnlySnapshot(definition.readOnly());
        policy.setRiskLevelSnapshot(defaultString(definition.riskLevel()).isBlank() ? "LOW" : definition.riskLevel());
        policy.setUpdatedByUser(user);
        return toToolPolicySummary(definition, toolPolicyRepository.save(policy));
    }

    private boolean resolveAutoExecuteAllowed(PlatformToolDefinition definition, boolean requestedAuto) {
        if (!requestedAuto || definition == null) {
            return false;
        }
        return definition.readOnly() || AUTO_WRITE_TOOL_ALLOWLIST.contains(definition.code());
    }

    private ChatRoomAgentConfigEntity resolveConfig(ChatRoomEntity room) {
        return configRepository.findByRoom_Id(room.getId()).orElseGet(() -> {
            ChatRoomAgentConfigEntity config = new ChatRoomAgentConfigEntity();
            config.setRoom(room);
            config.setAuthorizedByUser(room.getCreatorUser());
            config.setAuthorizedAt(LocalDateTime.now());
            return config;
        });
    }

    private ChatRoomAgentConfigSummary toConfigSummary(ChatRoomAgentConfigEntity config) {
        UserEntity authorizedBy = config.getAuthorizedByUser();
        return new ChatRoomAgentConfigSummary(
                config.getRoom() == null ? null : config.getRoom().getId(),
                config.isEnabled(),
                defaultString(config.getDisplayName()),
                defaultString(config.getSystemInstruction()),
                config.isProactiveSummaryEnabled(),
                config.isKeywordWatchEnabled(),
                config.isTaskStatusCallbackEnabled(),
                config.getProactiveSummaryMessageThreshold(),
                config.getProactiveSummaryMinIntervalMinutes(),
                readStringList(config.getKeywordWatchTermsJson()),
                config.getKeywordWatchCooldownMinutes(),
                readStringList(config.getTaskStatusCallbackStatusesJson()),
                authorizedBy == null ? null : authorizedBy.getId(),
                authorizedBy == null ? "" : displayName(authorizedBy),
                formatTime(config.getAuthorizedAt()),
                formatTime(config.getUpdatedAt())
        );
    }

    private ChatRoomAgentToolPolicySummary toToolPolicySummary(PlatformToolDefinition definition, ChatRoomAgentToolPolicyEntity policy) {
        boolean autoAllowed = definition.readOnly() || AUTO_WRITE_TOOL_ALLOWLIST.contains(definition.code());
        return new ChatRoomAgentToolPolicySummary(
                definition.code(),
                definition.name(),
                definition.moduleCode(),
                definition.readOnly(),
                definition.riskLevel(),
                policy == null || policy.isEnabled(),
                policy != null && policy.isAutoExecute(),
                autoAllowed,
                definition.permissionCode(),
                policy == null ? null : formatTime(policy.getUpdatedAt())
        );
    }

    private ChatRoomAgentTaskSummary appendEvent(ChatRoomAgentTaskEntity task, String eventType, String message, Map<String, Object> payload) {
        ChatRoomAgentTaskEventEntity event = new ChatRoomAgentTaskEventEntity();
        event.setTask(task);
        event.setRoom(task.getRoom());
        event.setEventType(eventType);
        event.setMessage(message);
        event.setPayloadJson(writePayload(payload));
        ChatRoomAgentTaskEventEntity saved = taskEventRepository.save(event);
        chatWebSocketPushService.broadcastAgentTaskEvent(task.getRoom().getId(), toEventSummary(saved));
        return toTaskSummary(task);
    }

    private ChatRoomAgentTaskEventSummary toEventSummary(ChatRoomAgentTaskEventEntity event) {
        return new ChatRoomAgentTaskEventSummary(
                event.getId(),
                event.getTask() == null ? null : event.getTask().getId(),
                event.getRoom() == null ? null : event.getRoom().getId(),
                event.getEventType(),
                event.getMessage(),
                event.getPayloadJson(),
                formatTime(event.getCreatedAt())
        );
    }

    private ChatRoomEntity requireRoom(Long roomId) {
        return chatRoomRepository.findById(roomId)
                .orElseThrow(() -> new NoSuchElementException("聊天室不存在"));
    }

    private ChatRoomAgentTaskEntity requireTask(Long roomId, Long taskId) {
        ChatRoomAgentTaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("Agent 任务不存在"));
        if (task.getRoom() == null || !roomId.equals(task.getRoom().getId())) {
            throw new ForbiddenException("无权访问该 Agent 任务");
        }
        chatRoomService.requireAccessibleRoom(roomId);
        return task;
    }

    private ChatMessageEntity resolveMessage(Long messageId) {
        if (messageId == null || chatMessageRepository == null) {
            return null;
        }
        return chatMessageRepository.findById(messageId).orElse(null);
    }

    private UserEntity resolveUser(Long userId) {
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).orElse(null);
    }

    private void requireRoomOwner(ChatRoomEntity room, Long userId) {
        if (room == null || room.getCreatorUser() == null || !room.getCreatorUser().getId().equals(userId)) {
            throw new ForbiddenException("只有房主可以维护聊天室 Agent");
        }
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname());
        return nickname.isBlank() ? defaultString(user.getUsername()) : nickname;
    }

    private String resolveErrorMessage(Exception exception) {
        return exception == null || exception.getMessage() == null || exception.getMessage().isBlank()
                ? "Hermes 任务执行失败"
                : exception.getMessage().trim();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String trimToMax(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private ChatRoomAgentTaskEntity maybeCreateKeywordTask(ChatRoomEntity room,
                                                           ChatRoomAgentConfigEntity config,
                                                           ChatMessageEntity message) {
        if (!config.isKeywordWatchEnabled()) {
            return null;
        }
        List<String> terms = readStringList(config.getKeywordWatchTermsJson());
        if (terms.isEmpty()) {
            return null;
        }
        String content = defaultString(message.getContent()).toLowerCase(Locale.ROOT);
        String matched = terms.stream()
                .filter(term -> !term.isBlank() && content.contains(term.toLowerCase(Locale.ROOT)))
                .findFirst()
                .orElse("");
        if (matched.isBlank()) {
            return null;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime lastTriggeredAt = config.getKeywordLastTriggeredAt();
        if (lastTriggeredAt != null && lastTriggeredAt.plusMinutes(Math.max(config.getKeywordWatchCooldownMinutes(), 0)).isAfter(now)) {
            return null;
        }
        String sourceRef = "keyword:message:" + message.getId();
        if (taskRepository.existsByTriggerTypeAndSourceRef(TRIGGER_KEYWORD, sourceRef)) {
            return null;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("matchedTerm", matched);
        payload.put("messageId", message.getId());
        payload.put("messageContent", defaultString(message.getContent()));
        ChatRoomAgentTaskEntity task = createActiveTask(room, config, message, TRIGGER_KEYWORD, "keyword-watch", sourceRef, payload);
        config.setKeywordLastTriggeredAt(now);
        configRepository.save(config);
        return task;
    }

    private ChatRoomAgentTaskEntity maybeCreateSummaryTask(ChatRoomEntity room,
                                                           ChatRoomAgentConfigEntity config,
                                                           ChatMessageEntity latestMessage) {
        if (!config.isProactiveSummaryEnabled() || chatMessageRepository == null) {
            return null;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime lastSummaryAt = config.getLastSummaryAt();
        if (lastSummaryAt != null && lastSummaryAt.plusMinutes(Math.max(config.getProactiveSummaryMinIntervalMinutes(), 1)).isAfter(now)) {
            return null;
        }
        long newMessageCount = chatMessageRepository.countUserMessagesAfter(room.getId(), config.getLastSummaryMessageId());
        int threshold = Math.max(config.getProactiveSummaryMessageThreshold(), 1);
        if (newMessageCount < threshold) {
            return null;
        }
        Long latestMessageId = latestMessage == null ? null : latestMessage.getId();
        String sourceRef = "summary:room:" + room.getId() + ":to:" + latestMessageId;
        if (taskRepository.existsByTriggerTypeAndSourceRef(TRIGGER_SUMMARY, sourceRef)) {
            return null;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("newMessageCount", newMessageCount);
        payload.put("fromMessageId", config.getLastSummaryMessageId());
        payload.put("toMessageId", latestMessageId);
        ChatRoomAgentTaskEntity task = createActiveTask(room, config, latestMessage, TRIGGER_SUMMARY, "proactive-summary", sourceRef, payload);
        config.setLastSummaryMessageId(latestMessageId);
        config.setLastSummaryAt(now);
        configRepository.save(config);
        return task;
    }

    private ChatRoomAgentTaskEntity maybeCreateTaskStatusCallbackTask(ChatRoomAgentConfigEntity config,
                                                                      ExecutionTaskEntity executionTask,
                                                                      String normalizedStatus) {
        ChatRoomEntity room = config.getRoom();
        if (room == null || room.getProject() == null) {
            return null;
        }
        String sourceRef = "execution-task:" + executionTask.getId() + ":status:" + normalizedStatus;
        if (taskRepository.existsByTriggerTypeAndSourceRef(TRIGGER_TASK_STATUS, sourceRef)) {
            return null;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("executionTaskId", executionTask.getId());
        payload.put("title", defaultString(executionTask.getTitle()));
        payload.put("status", normalizedStatus);
        payload.put("scenarioCode", defaultString(executionTask.getScenarioCode()));
        payload.put("latestSummary", defaultString(executionTask.getLatestSummary()));
        payload.put("projectId", room.getProject().getId());
        payload.put("projectName", defaultString(room.getProject().getName()));
        return createActiveTask(room, config, null, TRIGGER_TASK_STATUS, "execution-task-status", sourceRef, payload);
    }

    private ChatRoomAgentTaskEntity createActiveTask(ChatRoomEntity room,
                                                     ChatRoomAgentConfigEntity config,
                                                     ChatMessageEntity triggerMessage,
                                                     String triggerType,
                                                     String source,
                                                     String sourceRef,
                                                     Map<String, Object> payload) {
        ChatMessageEntity assistantMessage = buildAssistantPlaceholder(room);
        ChatMessageEntity savedAssistant = chatMessageRepository == null ? assistantMessage : chatMessageRepository.save(assistantMessage);
        UserEntity authorizedBy = config.getAuthorizedByUser() == null ? room.getCreatorUser() : config.getAuthorizedByUser();
        ChatRoomAgentTaskEntity task = new ChatRoomAgentTaskEntity();
        task.setRoom(room);
        task.setAssistantMessage(savedAssistant);
        task.setTriggerMessage(triggerMessage);
        task.setTriggerUser(triggerMessage == null ? null : triggerMessage.getSenderUser());
        task.setAuthorizedByUser(authorizedBy);
        task.setTriggerType(triggerType);
        task.setStatus(TASK_PENDING);
        task.setSource(source);
        task.setSourceRef(sourceRef);
        task.setPayloadJson(writePayload(payload));
        ChatRoomAgentTaskEntity saved = taskRepository.save(task);
        savedAssistant.setAgentTask(saved);
        if (chatMessageRepository != null) {
            chatMessageRepository.save(savedAssistant);
        }
        appendEvent(saved, "TASK_CREATED", "Hermes 主动任务已进入队列", payload == null ? Map.of() : payload);
        if (chatRoomService != null) {
            chatWebSocketPushService.broadcastMessageCreated(room.getId(), chatRoomService.toMessageSummary(savedAssistant));
        }
        chatWebSocketPushService.broadcastAgentTaskCreated(room.getId(), toTaskSummary(saved));
        publishTaskIfPending(saved);
        return saved;
    }

    private ChatMessageEntity buildAssistantPlaceholder(ChatRoomEntity room) {
        ChatMessageEntity message = new ChatMessageEntity();
        message.setRoom(room);
        message.setSenderUser(null);
        message.setRole(ChatRoomService.ROLE_ASSISTANT);
        message.setSenderUsernameSnapshot("hermes");
        message.setSenderNameSnapshot("Hermes");
        message.setSenderAvatarSnapshot("");
        message.setContent("");
        message.setStatus(ChatRoomService.STATUS_STREAMING);
        message.setMentionsHermes(false);
        return message;
    }

    private void publishTaskIfPending(ChatRoomAgentTaskEntity task) {
        if (task == null || !TASK_PENDING.equals(defaultString(task.getStatus())) || queuePublisher == null) {
            return;
        }
        queuePublisher.publishAfterCommit(task.getId());
    }

    private String buildTaskInstruction(ChatRoomAgentTaskEntity task) {
        String triggerType = defaultString(task.getTriggerType());
        String payload = defaultString(task.getPayloadJson()).isBlank() ? "{}" : defaultString(task.getPayloadJson());
        if (TRIGGER_SUMMARY.equals(triggerType)) {
            return "请主动总结这个聊天室最近的关键结论、风险和下一步。触发上下文：" + payload;
        }
        if (TRIGGER_KEYWORD.equals(triggerType)) {
            return "聊天室消息命中了关键字监听，请判断是否需要提醒团队，并给出简洁可执行建议。触发上下文：" + payload;
        }
        if (TRIGGER_TASK_STATUS.equals(triggerType)) {
            return "执行中心任务状态发生变化，请向聊天室回写状态、影响和下一步。触发上下文：" + payload;
        }
        return "请处理聊天室 Agent 任务。触发上下文：" + payload;
    }

    private List<String> normalizeStatusList(List<String> statuses) {
        List<String> normalized = normalizeStringList(statuses).stream()
                .map(item -> item.toUpperCase(Locale.ROOT))
                .filter(item -> List.of("PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELED", "WAITING_CONFIRMATION").contains(item))
                .distinct()
                .toList();
        return normalized.isEmpty() ? List.of("SUCCESS", "FAILED", "CANCELED") : normalized;
    }

    private List<String> normalizeStringList(List<String> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .map(this::defaultString)
                .filter(value -> !value.isBlank())
                .distinct()
                .limit(50)
                .toList();
    }

    private List<String> readStringList(String json) {
        if (defaultString(json).isBlank()) {
            return List.of();
        }
        try {
            List<String> values = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            return normalizeStringList(values);
        } catch (Exception exception) {
            return List.of();
        }
    }

    private String writeStringList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(normalizeStringList(values));
        } catch (Exception exception) {
            return "[]";
        }
    }

    private String writePayload(Map<String, Object> payload) {
        try {
            return objectMapper.writeValueAsString(payload == null ? Map.of() : payload);
        } catch (Exception exception) {
            return "{}";
        }
    }

    private int clampInt(Integer value, int min, int max, int fallback) {
        int resolved = value == null ? fallback : value;
        if (resolved < min) {
            return min;
        }
        return Math.min(resolved, max);
    }
}
