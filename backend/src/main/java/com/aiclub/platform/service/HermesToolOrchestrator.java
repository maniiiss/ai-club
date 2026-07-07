package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.HermesSelectionCard;
import com.aiclub.platform.dto.HermesSelectionOption;
import com.aiclub.platform.dto.HermesToolCallRequest;
import com.aiclub.platform.dto.HermesToolExecutionOutcome;
import com.aiclub.platform.dto.HermesToolExecutionPolicy;
import com.aiclub.platform.dto.PlatformToolCandidate;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Hermes 工具编排服务。
 * 新版只承担平台侧工具执行、候选评分、歧义选择和写操作确认，不再负责模型规划。
 */
@Service
public class HermesToolOrchestrator {

    private static final Set<String> ACTIVE_STATUSES = Set.of(
            "进行中", "处理中", "待开始", "待处理", "OPEN", "TODO", "RUNNING", "ACTIVE", "READY"
    );

    private final PlatformToolExecutor platformToolExecutor;
    private final PlatformToolRegistry platformToolRegistry;
    private final HermesActionPlannerService hermesActionPlannerService;
    private final ObjectMapper objectMapper;

    public HermesToolOrchestrator(PlatformToolExecutor platformToolExecutor,
                                  PlatformToolRegistry platformToolRegistry,
                                  HermesActionPlannerService hermesActionPlannerService,
                                  ObjectMapper objectMapper) {
        this.platformToolExecutor = platformToolExecutor;
        this.platformToolRegistry = platformToolRegistry;
        this.hermesActionPlannerService = hermesActionPlannerService;
        this.objectMapper = objectMapper;
    }

    /**
     * 将显式页面上下文、历史 grounding 与用户的候选选择合并成新一轮工具循环的起点状态。
     */
    public HermesGroundingState seedGroundingState(HermesContextAssembler.HermesConversationContext context,
                                                   HermesChatRequest request,
                                                   HermesGroundingState existingGroundingState) {
        HermesGroundingState state = existingGroundingState == null ? HermesGroundingState.empty() : existingGroundingState;

        HermesReferenceSummary projectReference = findReference(context.references(), "PROJECT");
        if (context.projectId() != null) {
            state = state.withBoundSlot("project", new HermesGroundingTarget(
                    "project",
                    "PROJECT",
                    context.projectId(),
                    projectReference == null ? "当前项目 #" + context.projectId() : defaultString(projectReference.title()),
                    projectReference == null ? "/projects/" + context.projectId() + "/iterations" : defaultString(projectReference.route()),
                    context.projectId(),
                    "CONTEXT",
                    Map.of("projectId", context.projectId())
            ));
        }

        HermesReferenceSummary taskReference = findReference(context.references(), "TASK");
        if (context.taskId() != null) {
            LinkedHashMap<String, Object> taskPayload = new LinkedHashMap<>();
            if (context.projectId() != null) {
                taskPayload.put("projectId", context.projectId());
            }
            taskPayload.put("workItemId", context.taskId());
            state = state.withBoundSlot("workItem", new HermesGroundingTarget(
                    "workItem",
                    "WORK_ITEM",
                    context.taskId(),
                    taskReference == null ? "当前工作项 #" + context.taskId() : defaultString(taskReference.title()),
                    taskReference == null ? "" : defaultString(taskReference.route()),
                    context.projectId(),
                    "CONTEXT",
                    Map.copyOf(taskPayload)
            ));
        }

        HermesReferenceSummary wikiSpaceReference = findReference(context.references(), "WIKI_SPACE");
        if (context.wikiSpaceId() != null) {
            HermesGroundingTarget wikiSpaceTarget = new HermesGroundingTarget(
                    "wikiSpace",
                    "WIKI_SPACE",
                    context.wikiSpaceId(),
                    wikiSpaceReference == null ? "当前 Wiki 空间 #" + context.wikiSpaceId() : defaultString(wikiSpaceReference.title()),
                    wikiSpaceReference == null ? "/wiki/spaces/" + context.wikiSpaceId() : defaultString(wikiSpaceReference.route()),
                    context.projectId(),
                    "CONTEXT",
                    Map.of("spaceId", context.wikiSpaceId())
            );
            state = state.withBoundSlot("wikiSpace", wikiSpaceTarget)
                    .withRecentResolvedSlot("wikiSpace", wikiSpaceTarget);
        }

        HermesReferenceSummary wikiPageReference = findReference(context.references(), "WIKI_PAGE");
        if (context.wikiPageId() != null) {
            LinkedHashMap<String, Object> wikiPagePayload = new LinkedHashMap<>();
            if (context.wikiSpaceId() != null) {
                wikiPagePayload.put("spaceId", context.wikiSpaceId());
            }
            wikiPagePayload.put("pageId", context.wikiPageId());
            HermesGroundingTarget wikiPageTarget = new HermesGroundingTarget(
                    "wikiPage",
                    "WIKI_PAGE",
                    context.wikiPageId(),
                    wikiPageReference == null ? "当前 Wiki 页面 #" + context.wikiPageId() : defaultString(wikiPageReference.title()),
                    wikiPageReference == null
                            ? (context.wikiSpaceId() == null ? "" : "/wiki/spaces/" + context.wikiSpaceId() + "/pages/" + context.wikiPageId())
                            : defaultString(wikiPageReference.route()),
                    context.projectId(),
                    "CONTEXT",
                    Map.copyOf(wikiPagePayload)
            );
            state = state.withBoundSlot("wikiPage", wikiPageTarget)
                    .withRecentResolvedSlot("wikiPage", wikiPageTarget);
        }

        if (request.iterationId() != null) {
            LinkedHashMap<String, Object> iterationPayload = new LinkedHashMap<>();
            if (context.projectId() != null) {
                iterationPayload.put("projectId", context.projectId());
            }
            iterationPayload.put("iterationId", request.iterationId());
            state = state.withBoundSlot("iteration", new HermesGroundingTarget(
                    "iteration",
                    "ITERATION",
                    request.iterationId(),
                    "当前迭代 #" + request.iterationId(),
                    "",
                    context.projectId(),
                    "REQUEST",
                    Map.copyOf(iterationPayload)
            ));
        }

        if (request.planId() != null) {
            LinkedHashMap<String, Object> planPayload = new LinkedHashMap<>();
            if (context.projectId() != null) {
                planPayload.put("projectId", context.projectId());
            }
            planPayload.put("testPlanId", request.planId());
            state = state.withBoundSlot("testPlan", new HermesGroundingTarget(
                    "testPlan",
                    "TEST_PLAN",
                    request.planId(),
                    "当前测试计划 #" + request.planId(),
                    "/tests/" + request.planId(),
                    context.projectId(),
                    "REQUEST",
                    Map.copyOf(planPayload)
            ));
        }

        if (request.selection() != null) {
            HermesGroundingTarget selectedTarget = resolveSelectionTarget(request.selection().slot(), request.selection().entityType(), request.selection().entityId(), state);
            state = state.withBoundSlot(request.selection().slot(), selectedTarget)
                    .withRecentResolvedSlot(request.selection().slot(), selectedTarget)
                    .clearPendingSelection();
        }
        return state;
    }

    /**
     * 执行一次 Hermes 发起的工具调用。
     * 读工具会返回 tool message，写工具会被转成待确认动作卡片并中断 loop。
     */
    public HermesToolExecutionOutcome executeToolCall(HermesToolCallRequest toolCall,
                                                      String scopeKey,
                                                      HermesContextAssembler.HermesConversationContext context,
                                                      HermesChatRequest request,
                                                      HermesGroundingState groundingState) {
        return executeToolCall(toolCall, scopeKey, context, request, groundingState, HermesToolExecutionPolicy.empty());
    }

    /**
     * 执行一次 Hermes 发起的工具调用，并允许聊天室 Agent 按房间策略自动执行低中风险写工具。
     */
    public HermesToolExecutionOutcome executeToolCall(HermesToolCallRequest toolCall,
                                                      String scopeKey,
                                                      HermesContextAssembler.HermesConversationContext context,
                                                      HermesChatRequest request,
                                                      HermesGroundingState groundingState,
                                                      HermesToolExecutionPolicy executionPolicy) {
        String toolCode = defaultString(toolCall == null ? null : toolCall.toolCode());
        if (toolCode.isBlank()) {
            return stopWithFailure(groundingState, "模型返回了无效的工具调用。", toolCall, Map.of());
        }

        if (!platformToolRegistry.isEnabled(toolCode)) {
            return stopWithFailure(groundingState, "当前工具已停用：" + toolCode, toolCall, Map.of());
        }

        if (!platformToolRegistry.requireDefinition(toolCode).readOnly()) {
            String writeToolFailureMessage = resolveWriteToolFailureMessage(toolCode, toolCall.arguments(), groundingState);
            if (!writeToolFailureMessage.isBlank()) {
                return stopWithFailure(groundingState, writeToolFailureMessage, toolCall, toolCall.arguments());
            }
            if (executionPolicy != null && executionPolicy.hasChatRoomAgentTask()) {
                if (!executionPolicy.isToolEnabled(toolCode)) {
                    return stopWithFailure(groundingState, "聊天室 Agent 未授权使用工具：" + toolCode, toolCall, toolCall.arguments());
                }
                if (executionPolicy.canAutoExecute(toolCode)) {
                    ValidatedToolCall validatedToolCall = validateWriteToolCall(toolCall, context, request, groundingState);
                    if (validatedToolCall == null) {
                        return stopWithFailure(groundingState, "工具参数不完整或不合法，平台已拒绝本次写操作。", toolCall, Map.of());
                    }
                    PlatformToolResult rawResult = safeExecute(
                            validatedToolCall.toolCode(),
                            scopeKey,
                            validatedToolCall.projectId(),
                            validatedToolCall.arguments()
                    );
                    return new HermesToolExecutionOutcome(
                            groundingState,
                            List.of(rawResult),
                            List.of(),
                            List.of(),
                            toToolMessageContent(rawResult),
                            false,
                            "",
                            defaultString(rawResult == null ? null : rawResult.summary()),
                            debugExecution(toolCall,
                                    isFailedToolResult(rawResult) ? "FAILED" : "SUCCESS",
                                    validatedToolCall.arguments(),
                                    rawResult == null ? "" : rawResult.summary())
                    );
                }
            }
            HermesActionSummary action = hermesActionPlannerService.createActionFromToolCall(
                    toolCode,
                    toolCall.arguments(),
                    groundingState,
                    request == null ? "" : request.question()
            );
            if (action == null) {
                return stopWithFailure(groundingState, "当前写操作缺少必要参数，暂时不能生成确认动作。", toolCall, Map.of());
            }
            String localSummary = buildActionSummary(action);
            return new HermesToolExecutionOutcome(
                    groundingState,
                    List.of(),
                    List.of(),
                    List.of(action),
                    "",
                    true,
                    "awaiting_confirmation",
                    localSummary,
                    debugExecution(toolCall, "STOPPED", action.params(), "写操作已转为确认卡片")
            );
        }

        if (!platformToolRegistry.isAllowAutoExecute(toolCode)) {
            return stopWithFailure(groundingState, "当前工具未开启自动执行：" + toolCode, toolCall, Map.of());
        }

        ValidatedToolCall validatedToolCall = validateReadToolCall(toolCall, context, request, groundingState);
        if (validatedToolCall == null) {
            return stopWithFailure(groundingState, "工具参数不完整或不合法，平台已拒绝本次查询。", toolCall, Map.of());
        }

        PlatformToolResult rawResult = safeExecute(validatedToolCall.toolCode(), scopeKey, validatedToolCall.projectId(), validatedToolCall.arguments());
        PlatformToolResult scoredResult = attachCandidateScores(rawResult, validatedToolCall, context, groundingState);
        if (shouldKeepSearchResultAsCollection(validatedToolCall, request)) {
            return new HermesToolExecutionOutcome(
                    groundingState,
                    List.of(scoredResult),
                    List.of(),
                    List.of(),
                    toToolMessageContent(scoredResult),
                    false,
                    "",
                    defaultString(scoredResult == null ? null : scoredResult.summary()),
                    debugExecution(toolCall, "SUCCEEDED", validatedToolCall.arguments(), "已按集合查询返回结果")
            );
        }
        HermesGroundingState nextGroundingState = groundingState;
        List<HermesSelectionCard> selectionCards = new ArrayList<>();
        if (!Boolean.TRUE.equals(scoredResult.metadata().get("failed"))) {
            nextGroundingState = mergeToolResultIntoGrounding(groundingState, request.question(), validatedToolCall.slot(), scoredResult, selectionCards);
        }

        if (!selectionCards.isEmpty()) {
            HermesGroundingState pendingState = nextGroundingState.withPendingSelectionCards(selectionCards, request.question());
            return new HermesToolExecutionOutcome(
                    pendingState,
                    List.of(scoredResult),
                    List.copyOf(selectionCards),
                    List.of(),
                    "",
                    true,
                    "awaiting_selection",
                    buildSelectionSummary(selectionCards),
                    debugExecution(toolCall, "STOPPED", validatedToolCall.arguments(), "产生歧义候选，需要用户确认")
            );
        }

        return new HermesToolExecutionOutcome(
                nextGroundingState.clearPendingSelection(),
                List.of(scoredResult),
                List.of(),
                List.of(),
                toToolMessageContent(scoredResult),
                false,
                "",
                "",
                debugExecution(toolCall, Boolean.TRUE.equals(scoredResult.metadata().get("failed")) ? "FAILED" : "SUCCESS", validatedToolCall.arguments(), scoredResult.summary())
        );
    }

    /**
     * 写工具自动执行前仍要按工具 schema 过滤参数，并只补齐会话中已安全确定的业务主键。
     */
    private ValidatedToolCall validateWriteToolCall(HermesToolCallRequest toolCall,
                                                    HermesContextAssembler.HermesConversationContext context,
                                                    HermesChatRequest request,
                                                    HermesGroundingState groundingState) {
        String toolCode = defaultString(toolCall.toolCode());
        var definition = platformToolRegistry.requireDefinition(toolCode);
        if (definition.readOnly()) {
            return null;
        }
        LinkedHashMap<String, Object> arguments = new LinkedHashMap<>();
        Map<String, Object> rawArguments = toolCall.arguments() == null ? Map.of() : toolCall.arguments();
        for (String inputKey : definition.inputSchema().keySet()) {
            Object value = rawArguments.get(inputKey);
            if (value != null) {
                arguments.put(inputKey, value);
            }
        }
        putIfAbsent(arguments, "projectId", context == null ? null : context.projectId());
        putIfAbsent(arguments, "iterationId", resolveGroundedEntityId(groundingState, "iteration", request == null ? null : request.iterationId()));
        putIfAbsent(arguments, "workItemId", resolveGroundedEntityId(groundingState, "workItem", context == null ? null : context.taskId()));
        putIfAbsent(arguments, "bindingId", resolveGroundedEntityId(groundingState, "gitlabBinding", null));
        putIfAbsent(arguments, "testPlanId", resolveGroundedEntityId(groundingState, "testPlan", request == null ? null : request.planId()));
        Long projectId = resolveLong(arguments.get("projectId"));
        if (projectId == null && PlatformToolRegistry.TOOL_REPO_SCAN_START.equals(toolCode)) {
            HermesGroundingTarget binding = groundingState == null ? null : groundingState.boundSlot("gitlabBinding");
            projectId = binding == null ? null : binding.projectId();
        }
        return new ValidatedToolCall(toolCode, normalizeSlot(toolCode), projectId, Map.copyOf(arguments));
    }

    private HermesToolExecutionOutcome stopWithFailure(HermesGroundingState groundingState,
                                                       String message,
                                                       HermesToolCallRequest toolCall,
                                                       Map<String, Object> arguments) {
        return new HermesToolExecutionOutcome(
                groundingState,
                List.of(),
                List.of(),
                List.of(),
                "",
                true,
                "failed",
                message,
                debugExecution(toolCall, "FAILED", arguments, message)
        );
    }

    private boolean isFailedToolResult(PlatformToolResult result) {
        return result != null && result.metadata() != null && Boolean.TRUE.equals(result.metadata().get("failed"));
    }

    /**
     * 根据当前上下文补齐安全可推导的查询参数，并过滤掉未在 schema 中声明的字段。
     */
    private ValidatedToolCall validateReadToolCall(HermesToolCallRequest toolCall,
                                                   HermesContextAssembler.HermesConversationContext context,
                                                   HermesChatRequest request,
                                                   HermesGroundingState groundingState) {
        String toolCode = defaultString(toolCall.toolCode());
        if (shouldResolveCurrentWikiPageDirectly(toolCode, context, request, toolCall.arguments())) {
            LinkedHashMap<String, Object> anchoredArguments = new LinkedHashMap<>();
            anchoredArguments.put("spaceId", context.wikiSpaceId());
            anchoredArguments.put("pageId", context.wikiPageId());
            return new ValidatedToolCall(
                    PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL,
                    "wikiPage",
                    context.projectId(),
                    Map.copyOf(anchoredArguments)
            );
        }
        var definition = platformToolRegistry.requireDefinition(toolCode);
        if (!definition.readOnly()) {
            return null;
        }

        LinkedHashMap<String, Object> arguments = new LinkedHashMap<>();
        Map<String, Object> rawArguments = toolCall.arguments() == null ? Map.of() : toolCall.arguments();
        for (String inputKey : definition.inputSchema().keySet()) {
            Object value = rawArguments.get(inputKey);
            if (value != null) {
                arguments.put(inputKey, value);
            }
        }

        if (!PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH.equals(toolCode)) {
            putIfAbsent(arguments, "projectId", context.projectId());
        }
        putIfAbsent(arguments, "iterationId", resolveGroundedEntityId(groundingState, "iteration", request.iterationId()));
        putIfAbsent(arguments, "workItemId", resolveGroundedEntityId(groundingState, "workItem", context.taskId()));
        putIfAbsent(arguments, "testPlanId", resolveGroundedEntityId(groundingState, "testPlan", request.planId()));
        putIfAbsent(arguments, "bindingId", resolveGroundedEntityId(groundingState, "gitlabBinding", null));
        putIfAbsent(arguments, "spaceId", resolveGroundedEntityId(groundingState, "wikiSpace", context.wikiSpaceId()));
        putIfAbsent(arguments, "pageId", resolveGroundedEntityId(groundingState, "wikiPage", context.wikiPageId()));
        if (arguments.containsKey("keyword")) {
            arguments.put("keyword", defaultString(String.valueOf(arguments.get("keyword"))));
        }
        if (arguments.containsKey("query")) {
            String normalizedQuery = defaultString(String.valueOf(arguments.get("query")));
            if (PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH.equals(toolCode)
                    && isCurrentWikiPageReference(normalizedQuery)
                    && hasText(currentWikiPageTitle(context))) {
                normalizedQuery = currentWikiPageTitle(context);
            }
            arguments.put("query", normalizedQuery);
        }

        if (shouldRedirectRequirementCreationToIterationSelection(toolCode, request, groundingState, arguments)) {
            LinkedHashMap<String, Object> iterationArguments = new LinkedHashMap<>();
            iterationArguments.put("projectId", arguments.get("projectId"));
            Long projectId = resolveLong(iterationArguments.get("projectId"));
            return new ValidatedToolCall(
                    PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS,
                    "iteration",
                    projectId,
                    Map.copyOf(iterationArguments)
            );
        }

        Long projectId = resolveLong(arguments.get("projectId"));
        return new ValidatedToolCall(toolCode, normalizeSlot(toolCode), projectId, Map.copyOf(arguments));
    }

    /**
     * 创建需求时迭代是落点，不是从既有工作项里选一个对象。
     * 即使模型误调用 work_item.search，也在平台侧改查迭代候选，避免弹出工作项列表。
     */
    private boolean shouldRedirectRequirementCreationToIterationSelection(String toolCode,
                                                                          HermesChatRequest request,
                                                                          HermesGroundingState groundingState,
                                                                          Map<String, Object> arguments) {
        if (!PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH.equals(toolCode)) {
            return false;
        }
        if (!isRequirementCreationIntent(request == null ? "" : request.question())) {
            return false;
        }
        if (resolveLong(arguments == null ? null : arguments.get("iterationId")) != null) {
            return false;
        }
        HermesGroundingTarget iterationTarget = groundingState == null ? null : groundingState.boundSlot("iteration");
        return iterationTarget == null || iterationTarget.entityId() == null;
    }

    private boolean isRequirementCreationIntent(String question) {
        String normalized = defaultString(question).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        boolean createIntent = normalized.contains("创建")
                || normalized.contains("新建")
                || normalized.contains("新增")
                || normalized.contains("加一个")
                || normalized.contains("加个")
                || normalized.contains("提一个")
                || normalized.contains("提个")
                || normalized.contains("建一个")
                || normalized.contains("建个")
                || normalized.contains("create")
                || normalized.contains("add");
        boolean requirementIntent = normalized.contains("需求")
                || normalized.contains("requirement");
        boolean queryIntent = isCollectionIntentQuestion(normalized)
                || normalized.contains("查询")
                || normalized.contains("搜索")
                || normalized.contains("看看")
                || normalized.contains("汇总")
                || normalized.contains("总结");
        return createIntent && requirementIntent && !queryIntent;
    }

    /**
     * 只读工具真正执行入口。
     */
    private PlatformToolResult safeExecute(String toolCode, String scopeKey, Long projectId, Map<String, Object> payload) {
        try {
            return platformToolExecutor.execute(new PlatformToolRequest(toolCode, "HERMES", scopeKey, projectId, null, null, payload));
        } catch (RuntimeException exception) {
            return new PlatformToolResult(
                    toolCode,
                    toolCode,
                    "工具调用失败：" + defaultString(exception.getMessage()),
                    List.of(),
                    List.of(),
                    Map.of("failed", true)
            );
        }
    }

    /**
     * 为候选对象打分并排序，供唯一命中与歧义判断使用。
     */
    private PlatformToolResult attachCandidateScores(PlatformToolResult result,
                                                     ValidatedToolCall validatedToolCall,
                                                     HermesContextAssembler.HermesConversationContext context,
                                                     HermesGroundingState groundingState) {
        if (result == null || result.candidates() == null || result.candidates().isEmpty()) {
            return result;
        }
        List<PlatformToolCandidate> scoredCandidates = result.candidates().stream()
                .map(candidate -> withMatchScore(candidate, validatedToolCall, context, groundingState))
                .sorted(Comparator.comparingDouble(this::matchScore).reversed()
                        .thenComparing(candidate -> defaultString(candidate.title())))
                .toList();
        return new PlatformToolResult(
                result.toolCode(),
                result.toolName(),
                result.summary(),
                scoredCandidates,
                result.actions(),
                result.metadata()
        );
    }

    /**
     * 将工具结果并入 grounding，高分唯一命中直接绑定，歧义时生成候选卡片。
     */
    private HermesGroundingState mergeToolResultIntoGrounding(HermesGroundingState groundingState,
                                                              String question,
                                                              String slot,
                                                              PlatformToolResult result,
                                                              List<HermesSelectionCard> selectionCards) {
        if (result == null || result.candidates() == null || result.candidates().isEmpty() || slot.isBlank()) {
            return groundingState;
        }
        if (isUniqueHit(result.candidates())) {
            PlatformToolCandidate topCandidate = result.candidates().get(0);
            Map<String, Object> payload = topCandidate.payload() == null ? Map.of() : topCandidate.payload();
            HermesGroundingTarget target = new HermesGroundingTarget(
                    slot,
                    defaultString(topCandidate.type()),
                    topCandidate.id(),
                    defaultString(topCandidate.title()),
                    defaultString(topCandidate.route()),
                    resolveLong(payload.get("projectId")),
                    "TOOL_RESULT",
                    Map.copyOf(payload)
            );
            HermesGroundingState nextState = groundingState.withBoundSlot(slot, target)
                    .withRecentResolvedSlot(slot, target);
            Long projectId = resolveLong(payload.get("projectId"));
            if (!"project".equals(slot) && projectId != null && groundingState.boundSlot("project") == null) {
                nextState = nextState.withBoundSlot("project", new HermesGroundingTarget(
                        "project",
                        "PROJECT",
                        projectId,
                        defaultString(String.valueOf(payload.getOrDefault("projectName", "项目 #" + projectId))),
                        "/projects/" + projectId + "/iterations",
                        projectId,
                        "DERIVED",
                        Map.of("projectId", projectId)
                ));
            }
            return nextState;
        }
        selectionCards.add(buildSelectionCard(slot, question, result));
        return groundingState;
    }

    /**
     * 生成歧义选择卡片。
     */
    private HermesSelectionCard buildSelectionCard(String slot, String question, PlatformToolResult result) {
        List<HermesSelectionOption> options = result.candidates().stream()
                .limit(5)
                .map(candidate -> new HermesSelectionOption(
                        slot,
                        defaultString(candidate.type()),
                        candidate.id(),
                        defaultString(candidate.title()),
                        defaultString(candidate.subtitle()),
                        defaultString(candidate.route()),
                        matchScore(candidate),
                        matchReasons(candidate)
                ))
                .toList();
        return new HermesSelectionCard(
                slot,
                "请确认你指的是哪个" + selectionEntityLabel(result),
                "当前有多个候选命中，Hermes 需要你先选定一个对象再继续。",
                question,
                options
        );
    }

    private String selectionEntityLabel(PlatformToolResult result) {
        String entityType = result == null || result.candidates() == null || result.candidates().isEmpty()
                ? ""
                : defaultString(result.candidates().get(0).type()).toUpperCase(Locale.ROOT);
        return switch (entityType) {
            case "ITERATION" -> "迭代";
            case "PROJECT" -> "项目";
            case "WORK_ITEM" -> "工作项";
            case "USER" -> "成员";
            case "TEST_PLAN" -> "测试计划";
            case "GITLAB_BINDING" -> "仓库绑定";
            case "EXECUTION_TASK" -> "执行任务";
            case "WIKI_PAGE" -> "Wiki 页面";
            case "WIKI_SPACE" -> "Wiki 空间";
            default -> "对象";
        };
    }

    /**
     * 当前实现只在高分且明显领先时自动唯一命中。
     */
    private boolean isUniqueHit(List<PlatformToolCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) {
            return false;
        }
        double firstScore = matchScore(candidates.get(0));
        if (firstScore < 85D) {
            return false;
        }
        if (candidates.size() == 1) {
            return true;
        }
        double secondScore = matchScore(candidates.get(1));
        return firstScore - secondScore >= 10D;
    }

    private PlatformToolCandidate withMatchScore(PlatformToolCandidate candidate,
                                                 ValidatedToolCall validatedToolCall,
                                                 HermesContextAssembler.HermesConversationContext context,
                                                 HermesGroundingState groundingState) {
        Map<String, Object> candidatePayload = candidate.payload() == null ? Map.of() : candidate.payload();
        List<String> reasons = new ArrayList<>();
        double score = 0D;
        String keyword = resolvedSearchText(validatedToolCall.arguments());
        Long directEntityId = resolveDirectEntityId(validatedToolCall.slot(), validatedToolCall.arguments());
        if (directEntityId != null && Objects.equals(candidate.id(), directEntityId)) {
            score = Math.max(score, 100D);
            reasons.add("按对象 ID 精确命中");
        }
        String candidateCode = candidateCode(candidate);
        if (!keyword.isBlank() && !candidateCode.isBlank() && candidateCode.equalsIgnoreCase(keyword)) {
            score = Math.max(score, 100D);
            reasons.add("编号精确命中");
        }
        if (!keyword.isBlank() && defaultString(candidate.title()).equalsIgnoreCase(keyword)) {
            score = Math.max(score, 90D);
            reasons.add("标题完全匹配");
        }
        if (!keyword.isBlank() && containsIgnoreCase(candidate.title(), keyword)) {
            score = Math.max(score, 70D);
            reasons.add("标题包含关键词");
        }
        if (!keyword.isBlank() && containsIgnoreCase(candidate.subtitle(), keyword)) {
            score = Math.max(score, 55D);
            reasons.add("说明包含关键词");
        }
        if ("gitlabBinding".equals(validatedToolCall.slot())
                && !keyword.isBlank()
                && (containsIgnoreCase(String.valueOf(candidatePayload.get("gitlabProjectPath")), keyword)
                || containsIgnoreCase(String.valueOf(candidatePayload.get("gitlabProjectRef")), keyword))) {
            score += 20D;
            reasons.add("仓库路径命中关键词");
        }
        Long currentProjectId = context.projectId() != null ? context.projectId() : resolveLong(validatedToolCall.arguments().get("projectId"));
        Long candidateProjectId = resolveLong(candidatePayload.get("projectId"));
        if (currentProjectId != null && Objects.equals(currentProjectId, candidateProjectId)) {
            score += 15D;
            reasons.add("位于当前项目范围");
        }
        Long currentWikiSpaceId = context.wikiSpaceId() != null ? context.wikiSpaceId() : resolveLong(validatedToolCall.arguments().get("spaceId"));
        Long candidateWikiSpaceId = resolveLong(candidatePayload.get("spaceId"));
        if (currentWikiSpaceId != null && Objects.equals(currentWikiSpaceId, candidateWikiSpaceId)) {
            score += 12D;
            reasons.add("位于当前 Wiki 空间范围");
        }
        if ("wikiPage".equals(validatedToolCall.slot())
                && context.wikiPageId() != null
                && Objects.equals(context.wikiPageId(), candidate.id())
                && isCurrentWikiPageReference(keyword)) {
            score = Math.max(score, 100D);
            reasons.add("命中当前页面锚点");
        }
        if (PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH.equals(validatedToolCall.toolCode())
                && resolveLong(validatedToolCall.arguments().get("bindingId")) != null) {
            score += 75D;
            reasons.add("已限定仓库绑定范围");
        }
        HermesGroundingTarget recentTarget = groundingState == null ? null : groundingState.recentResolvedSlot(validatedToolCall.slot());
        if (recentTarget != null && Objects.equals(recentTarget.entityId(), candidate.id())) {
            score += 20D;
            reasons.add("命中最近会话锚点");
        }
        String status = defaultString(String.valueOf(candidatePayload.getOrDefault("status", "")));
        if (!status.isBlank() && ACTIVE_STATUSES.stream().anyMatch(active -> active.equalsIgnoreCase(status))) {
            score += 10D;
            reasons.add("状态活跃");
        }

        LinkedHashMap<String, Object> payload = new LinkedHashMap<>(candidatePayload);
        payload.put("matchScore", score);
        payload.put("matchReasons", List.copyOf(reasons));
        return new PlatformToolCandidate(
                candidate.type(),
                candidate.id(),
                candidate.title(),
                candidate.subtitle(),
                candidate.route(),
                payload,
                candidate.actions()
        );
    }

    /**
     * 将平台工具结果转成 Hermes `tool` message 内容。
     * 这里保留摘要、候选和 metadata，便于 Hermes 基于结构化事实继续推理。
     */
    private String toToolMessageContent(PlatformToolResult result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException exception) {
            return "{\"summary\":\"" + defaultString(result == null ? "" : result.summary()) + "\"}";
        }
    }

    private String buildSelectionSummary(List<HermesSelectionCard> selectionCards) {
        StringBuilder builder = new StringBuilder("我已经查到候选对象了，但还需要你先确认具体指的是哪一个。\n\n");
        for (HermesSelectionCard selectionCard : selectionCards) {
            builder.append("请先确认“").append(defaultString(selectionCard.slot())).append("”对应的对象。\n");
        }
        builder.append("\n你可以直接点击下方候选卡片继续。");
        return builder.toString().trim();
    }

    private String buildActionSummary(HermesActionSummary action) {
        return "我已经根据当前上下文准备好了一个待确认动作：\n- "
                + defaultString(action.title())
                + "："
                + defaultString(action.description())
                + "\n\n如果你确认无误，直接点击下方动作卡片即可继续。";
    }

    private Map<String, Object> debugExecution(HermesToolCallRequest toolCall,
                                               String status,
                                               Map<String, Object> arguments,
                                               String message) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("toolCode", toolCall == null ? "" : defaultString(toolCall.toolCode()));
        result.put("functionName", toolCall == null ? "" : defaultString(toolCall.functionName()));
        result.put("toolCallId", toolCall == null ? "" : defaultString(toolCall.toolCallId()));
        result.put("status", defaultString(status));
        result.put("arguments", arguments == null ? Map.of() : arguments);
        result.put("message", defaultString(message));
        return result;
    }

    private HermesGroundingTarget resolveSelectionTarget(String slot,
                                                         String entityType,
                                                         Long entityId,
                                                         HermesGroundingState groundingState) {
        if (groundingState != null && groundingState.pendingSelectionCards() != null) {
            for (HermesSelectionCard selectionCard : groundingState.pendingSelectionCards()) {
                if (!Objects.equals(defaultString(selectionCard.slot()), defaultString(slot))) {
                    continue;
                }
                for (HermesSelectionOption option : selectionCard.options()) {
                    if (Objects.equals(option.entityId(), entityId)
                            && defaultString(option.entityType()).equalsIgnoreCase(defaultString(entityType))) {
                        return new HermesGroundingTarget(
                                defaultString(slot),
                                defaultString(entityType),
                                entityId,
                                defaultString(option.title()),
                                defaultString(option.route()),
                                null,
                                "SELECTION",
                                Map.of(
                                        "matchScore", option.matchScore(),
                                        "matchReasons", option.matchReasons() == null ? List.of() : option.matchReasons()
                                )
                        );
                    }
                }
            }
        }
        return new HermesGroundingTarget(
                defaultString(slot),
                defaultString(entityType),
                entityId,
                "已选择对象 #" + entityId,
                "",
                null,
                "SELECTION",
                Map.of()
        );
    }

    private HermesReferenceSummary findReference(List<HermesReferenceSummary> references, String type) {
        if (references == null || type == null) {
            return null;
        }
        return references.stream()
                .filter(reference -> type.equalsIgnoreCase(defaultString(reference.type())))
                .findFirst()
                .orElse(null);
    }

    /**
     * 当前迭代下的列表型查询更适合把结果直接交给 Hermes 汇总，而不是误判成“需要用户选一个工作项”。
     */
    private boolean shouldKeepSearchResultAsCollection(ValidatedToolCall validatedToolCall,
                                                       HermesChatRequest request) {
        if (validatedToolCall == null) {
            return false;
        }
        String toolCode = defaultString(validatedToolCall.toolCode());
        if (!isCollectionFriendlySearchTool(toolCode)) {
            return false;
        }
        String question = request == null ? "" : defaultString(request.question());
        boolean collectionIntent = isCollectionIntentQuestion(question);
        if (PlatformToolRegistry.TOOL_PROJECT_SEARCH.equals(toolCode)) {
            // 业务意图：project.search 常被模型用来解析“这个项目”这类指代。
            // 只有用户明确在问项目集合时才直接返回列表，否则多个项目命中必须弹出候选确认卡片。
            return collectionIntent && isProjectCollectionQuestion(question) && !isSingularProjectReference(question);
        }
        if (!PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH.equals(toolCode)) {
            return collectionIntent;
        }
        String keyword = defaultString(String.valueOf(validatedToolCall.arguments().getOrDefault("keyword", "")));
        String workItemType = defaultString(String.valueOf(validatedToolCall.arguments().getOrDefault("workItemType", "")));
        Long iterationId = resolveLong(validatedToolCall.arguments().get("iterationId"));
        // 风险分析、列表和统计问题关注结果集合，不能因为命中了多个工作项就打断成单对象确认。
        if (collectionIntent) {
            return true;
        }
        if (iterationId == null) {
            return false;
        }
        if (isStatusCollectionQuestion(question) || hasWorkItemStatusFilter(validatedToolCall.arguments())) {
            return true;
        }
        if (!workItemType.isBlank()) {
            return true;
        }
        if (keyword.isBlank() || isGenericWorkItemCollectionKeyword(keyword)) {
            return true;
        }
        return collectionIntent;
    }

    private boolean hasWorkItemStatusFilter(Map<String, Object> arguments) {
        if (arguments == null || arguments.isEmpty()) {
            return false;
        }
        return !defaultString(String.valueOf(arguments.getOrDefault("status", ""))).isBlank();
    }

    private boolean isStatusCollectionQuestion(String question) {
        String normalized = defaultString(question).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        boolean statusIntent = normalized.contains("进行中")
                || normalized.contains("待开始")
                || normalized.contains("待处理")
                || normalized.contains("已完成")
                || normalized.contains("已阻塞")
                || normalized.contains("处理中")
                || normalized.contains("开发中")
                || normalized.contains("running")
                || normalized.contains("active")
                || normalized.contains("done");
        boolean collectionOrExistenceIntent = normalized.contains("还有")
                || normalized.contains("是否")
                || normalized.contains("有没有")
                || normalized.contains("有无")
                || normalized.contains("几个")
                || normalized.contains("多少")
                || normalized.contains("哪些")
                || normalized.contains("列表")
                || normalized.contains("统计");
        return statusIntent && collectionOrExistenceIntent;
    }

    private boolean isGenericWorkItemCollectionKeyword(String keyword) {
        String normalized = defaultString(keyword).toLowerCase(Locale.ROOT);
        return "需求".equals(normalized)
                || "任务".equals(normalized)
                || "缺陷".equals(normalized)
                || "bug".equals(normalized)
                || "工作项".equals(normalized)
                || "全部".equals(normalized)
                || "all".equals(normalized)
                || "已完成".equals(normalized)
                || "进行中".equals(normalized)
                || "待处理".equals(normalized)
                || "待开始".equals(normalized);
    }

    private boolean isProjectCollectionQuestion(String question) {
        String normalized = defaultString(question).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        return normalized.contains("哪些项目")
                || normalized.contains("有哪些项目")
                || normalized.contains("几个项目")
                || normalized.contains("多少项目")
                || normalized.contains("项目列表")
                || normalized.contains("项目清单")
                || normalized.contains("全部项目")
                || normalized.contains("所有项目")
                || normalized.contains("项目概览")
                || normalized.contains("项目总览")
                || normalized.contains("project list")
                || normalized.contains("projects");
    }

    private boolean isSingularProjectReference(String question) {
        String normalized = defaultString(question).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        return normalized.contains("这个项目")
                || normalized.contains("当前项目")
                || normalized.contains("本项目")
                || normalized.contains("该项目")
                || normalized.contains("这个project")
                || normalized.contains("current project");
    }

    /**
     * 这些工具天生既可能用于“解析单对象”，也可能用于“查询一个集合”。
     * 当问题语义明显是集合问题时，应优先把结果当作列表交给模型总结，而不是立即要求用户确认单对象。
     */
    private boolean isCollectionFriendlySearchTool(String toolCode) {
        return PlatformToolRegistry.TOOL_PROJECT_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH.equals(toolCode)
                || PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS.equals(toolCode);
    }

    /**
     * 统一识别“汇总/列表/统计”类问题，减少 Hermes 把集合问题误判成单对象详情。
     */
    private boolean isCollectionIntentQuestion(String question) {
        String normalized = defaultString(question);
        if (normalized.isBlank()) {
            return false;
        }
        String lowered = normalized.toLowerCase(Locale.ROOT);
        return lowered.contains("哪些")
                || lowered.contains("有哪些")
                || lowered.contains("多少")
                || lowered.contains("几个")
                || lowered.contains("列表")
                || lowered.contains("清单")
                || lowered.contains("汇总")
                || lowered.contains("总结")
                || lowered.contains("概览")
                || lowered.contains("总览")
                || lowered.contains("统计")
                || lowered.contains("全部")
                || lowered.contains("分别")
                || lowered.contains("最近有哪些")
                || lowered.contains("修复了多少")
                || lowered.contains("开发了哪些")
                || lowered.contains("发版内容");
    }

    private String normalizeSlot(String toolCode) {
        if (toolCode == null) {
            return "";
        }
        if (toolCode.startsWith("project.")) {
            return toolCode.contains("iteration") ? "iteration" : "project";
        }
        if (toolCode.startsWith("work_item.")) {
            return "workItem";
        }
        if (toolCode.startsWith("user.")) {
            return "member";
        }
        if (toolCode.startsWith("gitlab_binding.")) {
            return "gitlabBinding";
        }
        if (PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH.equals(toolCode)) {
            return "executionTask";
        }
        if (toolCode.startsWith("execution_task.")) {
            return "executionTask";
        }
        if (toolCode.startsWith("test_plan.")) {
            return "testPlan";
        }
        if (toolCode.startsWith("wiki_page.") || toolCode.startsWith("wiki_space.")) {
            return "wikiPage";
        }
        return "";
    }

    private Long resolveGroundedEntityId(HermesGroundingState groundingState, String slot, Long fallback) {
        HermesGroundingTarget target = groundingState == null ? null : groundingState.boundSlot(slot);
        return target != null && target.entityId() != null ? target.entityId() : fallback;
    }

    private Long resolveDirectEntityId(String slot, Map<String, Object> arguments) {
        if (arguments == null || slot == null) {
            return null;
        }
        return switch (slot) {
            case "project" -> resolveLong(arguments.get("projectId"));
            case "workItem" -> resolveLong(arguments.get("workItemId"));
            case "iteration" -> resolveLong(arguments.get("iterationId"));
            case "testPlan" -> resolveLong(arguments.get("testPlanId"));
            case "executionTask" -> resolveLong(arguments.get("executionTaskId"));
            case "member" -> resolveLong(arguments.get("memberId"));
            case "gitlabBinding" -> resolveLong(arguments.get("bindingId"));
            case "wikiPage" -> resolveLong(arguments.get("pageId"));
            case "wikiSpace" -> resolveLong(arguments.get("spaceId"));
            default -> null;
        };
    }

    /**
     * 写工具在进入动作规划前先做一次平台侧兜底校验，避免模型在缺关键参数时只能收到通用报错。
     */
    private String resolveWriteToolFailureMessage(String toolCode,
                                                  Map<String, Object> arguments,
                                                  HermesGroundingState groundingState) {
        if (PlatformToolRegistry.TOOL_REPO_SCAN_START.equals(toolCode)) {
            return resolveRepositoryScanWriteFailureMessage(arguments, groundingState);
        }
        return "";
    }

    /**
     * 仓库扫描要求先确定仓库绑定，再明确规则集。
     * 这里返回清晰的失败摘要，促使 Hermes 继续追问或先调用规则集列表工具。
     */
    private String resolveRepositoryScanWriteFailureMessage(Map<String, Object> arguments,
                                                            HermesGroundingState groundingState) {
        Long bindingId = resolveLong(arguments == null ? null : arguments.get("bindingId"));
        if (bindingId == null) {
            bindingId = resolveGroundedEntityId(groundingState, "gitlabBinding", null);
        }
        if (bindingId == null) {
            return "发起仓库扫描前需要先确认目标仓库。你可以先搜索并选择一个 GitLab 仓库绑定。";
        }
        Object rulesetCodeValue = arguments == null ? null : arguments.get("rulesetCode");
        String rulesetCode = rulesetCodeValue == null ? "" : defaultString(String.valueOf(rulesetCodeValue));
        if (rulesetCode.isBlank()) {
            return "发起仓库扫描前需要先确认规则集。你可以先让我列出可用规则集，或直接告诉我规则集名称。";
        }
        return "";
    }

    private String candidateCode(PlatformToolCandidate candidate) {
        if (candidate == null || candidate.payload() == null) {
            return "";
        }
        Object explicitCode = candidate.payload().get("workItemCode");
        if (explicitCode != null && !String.valueOf(explicitCode).isBlank()) {
            return String.valueOf(explicitCode).trim();
        }
        Object username = candidate.payload().get("username");
        if (username != null && !String.valueOf(username).isBlank()) {
            return String.valueOf(username).trim();
        }
        String title = defaultString(candidate.title());
        int separatorIndex = title.indexOf(' ');
        return separatorIndex > 0 ? title.substring(0, separatorIndex).trim() : "";
    }

    private boolean containsIgnoreCase(String source, String target) {
        return defaultString(source).toLowerCase(Locale.ROOT).contains(defaultString(target).toLowerCase(Locale.ROOT));
    }

    private double matchScore(PlatformToolCandidate candidate) {
        if (candidate == null || candidate.payload() == null) {
            return 0D;
        }
        Object value = candidate.payload().get("matchScore");
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null ? 0D : Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0D;
        }
    }

    private List<String> matchReasons(PlatformToolCandidate candidate) {
        if (candidate == null || candidate.payload() == null) {
            return List.of();
        }
        Object value = candidate.payload().get("matchReasons");
        if (value instanceof List<?> items) {
            return items.stream().map(String::valueOf).toList();
        }
        return List.of();
    }

    private boolean shouldResolveCurrentWikiPageDirectly(String toolCode,
                                                         HermesContextAssembler.HermesConversationContext context,
                                                         HermesChatRequest request,
                                                         Map<String, Object> rawArguments) {
        if (!PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH.equals(toolCode)) {
            return false;
        }
        if (context == null || context.wikiSpaceId() == null || context.wikiPageId() == null) {
            return false;
        }
        String query = rawArguments == null ? "" : defaultString(String.valueOf(rawArguments.getOrDefault("query", "")));
        if (isCurrentWikiPageReference(query)) {
            return true;
        }
        return request != null && isCurrentWikiPageReference(request.question());
    }

    private String resolvedSearchText(Map<String, Object> arguments) {
        if (arguments == null || arguments.isEmpty()) {
            return "";
        }
        String keyword = defaultString(String.valueOf(arguments.getOrDefault("keyword", "")));
        if (hasText(keyword)) {
            return keyword;
        }
        return defaultString(String.valueOf(arguments.getOrDefault("query", "")));
    }

    private String currentWikiPageTitle(HermesContextAssembler.HermesConversationContext context) {
        HermesReferenceSummary reference = findReference(context == null ? List.of() : context.references(), "WIKI_PAGE");
        return reference == null ? "" : defaultString(reference.title());
    }

    private boolean isCurrentWikiPageReference(String query) {
        String normalized = defaultString(query).toLowerCase(Locale.ROOT);
        if (normalized.isBlank()) {
            return false;
        }
        return normalized.contains("当前页面")
                || normalized.contains("当前页")
                || normalized.contains("本页")
                || normalized.contains("这个页面")
                || normalized.contains("这篇页面")
                || normalized.contains("当前wiki页面")
                || normalized.contains("当前wiki页");
    }

    private void putIfAbsent(Map<String, Object> payload, String key, Object value) {
        if (payload == null || key == null || key.isBlank() || value == null) {
            return;
        }
        Object existing = payload.get(key);
        if (existing == null || String.valueOf(existing).isBlank()) {
            payload.put(key, value);
        }
    }

    private Long resolveLong(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private record ValidatedToolCall(String toolCode,
                                     String slot,
                                     Long projectId,
                                     Map<String, Object> arguments) {
    }
}
