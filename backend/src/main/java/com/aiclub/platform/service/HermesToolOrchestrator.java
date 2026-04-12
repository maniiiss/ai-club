package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.HermesSelectionCard;
import com.aiclub.platform.dto.HermesSelectionOption;
import com.aiclub.platform.dto.HermesToolCallRequest;
import com.aiclub.platform.dto.HermesToolExecutionOutcome;
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
        String toolCode = defaultString(toolCall == null ? null : toolCall.toolCode());
        if (toolCode.isBlank()) {
            return stopWithFailure(groundingState, "模型返回了无效的工具调用。", toolCall, Map.of());
        }

        if (!platformToolRegistry.isEnabled(toolCode)) {
            return stopWithFailure(groundingState, "当前工具已停用：" + toolCode, toolCall, Map.of());
        }

        if (!platformToolRegistry.requireDefinition(toolCode).readOnly()) {
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

    /**
     * 根据当前上下文补齐安全可推导的查询参数，并过滤掉未在 schema 中声明的字段。
     */
    private ValidatedToolCall validateReadToolCall(HermesToolCallRequest toolCall,
                                                   HermesContextAssembler.HermesConversationContext context,
                                                   HermesChatRequest request,
                                                   HermesGroundingState groundingState) {
        String toolCode = defaultString(toolCall.toolCode());
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

        putIfAbsent(arguments, "projectId", context.projectId());
        putIfAbsent(arguments, "iterationId", resolveGroundedEntityId(groundingState, "iteration", request.iterationId()));
        putIfAbsent(arguments, "workItemId", resolveGroundedEntityId(groundingState, "workItem", context.taskId()));
        putIfAbsent(arguments, "testPlanId", resolveGroundedEntityId(groundingState, "testPlan", request.planId()));
        if (arguments.containsKey("keyword")) {
            arguments.put("keyword", defaultString(String.valueOf(arguments.get("keyword"))));
        }

        Long projectId = resolveLong(arguments.get("projectId"));
        return new ValidatedToolCall(toolCode, normalizeSlot(toolCode), projectId, Map.copyOf(arguments));
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
                "请确认你指的是哪个对象",
                "当前有多个候选命中，Hermes 需要你先选定一个对象再继续。",
                question,
                options
        );
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
        String keyword = defaultString(String.valueOf(validatedToolCall.arguments().getOrDefault("keyword", "")));
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
        Long currentProjectId = context.projectId() != null ? context.projectId() : resolveLong(validatedToolCall.arguments().get("projectId"));
        Long candidateProjectId = resolveLong(candidatePayload.get("projectId"));
        if (currentProjectId != null && Objects.equals(currentProjectId, candidateProjectId)) {
            score += 15D;
            reasons.add("位于当前项目范围");
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
        if (toolCode.startsWith("execution_task.")) {
            return "executionTask";
        }
        if (toolCode.startsWith("test_plan.")) {
            return "testPlan";
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
            default -> null;
        };
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

    private record ValidatedToolCall(String toolCode,
                                     String slot,
                                     Long projectId,
                                     Map<String, Object> arguments) {
    }
}
