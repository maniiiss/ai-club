package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.AssistantConversationState;
import com.aiclub.platform.dto.AssistantMemoryConsolidationStatus;
import com.aiclub.platform.dto.AssistantMemoryFactItem;
import com.aiclub.platform.dto.AssistantMemoryOverview;
import com.aiclub.platform.dto.AssistantMemoryConsolidationTask;
import com.aiclub.platform.dto.AssistantUserMemoryItem;
import com.aiclub.platform.dto.request.AssistantChatRequest;
import com.aiclub.platform.dto.request.AssistantSelectionRequest;
import com.aiclub.platform.memory.HindsightMemoryProvider;
import com.aiclub.platform.memory.MemoryProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Executor;

/**
 * 为 Assistant 问答补充用户记忆召回与会话记忆写入。
 * 设计原则有两条：
 * 1. 问答前优先召回当前用户自己沉淀过的会话记忆，再补共享记忆事实。
 * 2. 问答后异步写入 Hindsight，不让记忆旁路拖慢主问答响应。
 */
@Service
public class AssistantHindsightMemoryService {

    private static final Logger log = LoggerFactory.getLogger(AssistantHindsightMemoryService.class);
    private static final int MAX_FACTS_PER_BANK = 3;
    private static final int MAX_TOTAL_FACTS = 6;
    private static final int MAX_SUMMARY_LENGTH = 180;

    private final MemoryProvider memoryProvider;
    private final WikiSpaceService wikiSpaceService;
    private final Executor assistantMemoryRetentionExecutor;

    @Autowired
    public AssistantHindsightMemoryService(MemoryProvider memoryProvider,
                                        WikiSpaceService wikiSpaceService,
                                        @Qualifier("executionTaskExecutor") Executor assistantMemoryRetentionExecutor) {
        this.memoryProvider = memoryProvider;
        this.wikiSpaceService = wikiSpaceService;
        this.assistantMemoryRetentionExecutor = assistantMemoryRetentionExecutor;
    }

    /**
     * 兼容旧测试和迁移期调用方，具体 Hindsight 依赖只在适配器构造边界出现。
     */
    public AssistantHindsightMemoryService(HindsightClientService hindsightClientService,
                                           HindsightMemoryFallbackService hindsightMemoryFallbackService,
                                           HindsightProperties hindsightProperties,
                                           WikiSpaceService wikiSpaceService,
                                           Executor assistantMemoryRetentionExecutor) {
        this(new HindsightMemoryProvider(hindsightClientService, hindsightMemoryFallbackService, hindsightProperties),
                wikiSpaceService,
                assistantMemoryRetentionExecutor);
    }

    /**
     * 兼容直接 new 的测试场景，默认用同步执行器，避免额外等待异步线程。
     */
    public AssistantHindsightMemoryService(HindsightClientService hindsightClientService,
                                        HindsightMemoryFallbackService hindsightMemoryFallbackService,
                                        HindsightProperties hindsightProperties,
                                        WikiSpaceService wikiSpaceService) {
        this(hindsightClientService, hindsightMemoryFallbackService, hindsightProperties, wikiSpaceService, Runnable::run);
    }

    /**
     * 根据当前用户和当前作用域召回一小段 Prompt 可直接消费的记忆摘要。
     * 优先顺序是：当前用户会话记忆 -> 当前项目 / Wiki 记忆 -> 共享记忆。
     */
    public String buildMemoryContextMarkdown(CurrentUserInfo currentUser,
                                             AssistantContextAssembler.AssistantConversationContext context,
                                             AssistantChatRequest request) {
        String query = defaultString(request == null ? null : request.question());
        if (query.isBlank()) {
            return "";
        }
        RecallScope scope = resolveScope(context, request);
        List<MemoryProvider.MemoryScope> scopes = resolveRecallScopes(currentUser, scope);
        if (scopes.isEmpty()) {
            return "";
        }
        List<String> recallTags = scope == null ? List.of() : scope.recallTags();

        List<MemoryProvider.MemoryRecord> collectedFacts = new ArrayList<>();
        for (MemoryProvider.MemoryScope memoryScope : scopes) {
            try {
                MemoryProvider.MemoryKind kind = "assistant-user".equals(memoryScope.type())
                        ? MemoryProvider.MemoryKind.CONVERSATION
                        : MemoryProvider.MemoryKind.FACT;
                collectedFacts.addAll(memoryProvider.recall(new MemoryProvider.MemoryQuery(
                        memoryScope, kind, query, recallTags, MAX_FACTS_PER_BANK
                )));
            } catch (RuntimeException exception) {
                log.warn("Assistant 记忆召回失败，scope={}，question={}: {}",
                        memoryScope.type(), abbreviate(query, 60), sanitizeWarning(exception));
            }
            if (collectedFacts.size() >= MAX_TOTAL_FACTS) {
                break;
            }
        }

        List<MemoryProvider.MemoryRecord> facts = deduplicateFacts(collectedFacts);
        if (facts.isEmpty()) {
            return "";
        }
        if (facts.size() > MAX_TOTAL_FACTS) {
            facts = facts.subList(0, MAX_TOTAL_FACTS);
        }
        return renderMarkdown(facts);
    }

    /**
     * 兼容旧调用方：未显式传用户时，只保留原有项目 / Wiki 记忆召回逻辑。
     */
    public String buildMemoryContextMarkdown(AssistantContextAssembler.AssistantConversationContext context,
                                             AssistantChatRequest request) {
        return buildMemoryContextMarkdown(null, context, request);
    }

    /**
     * Assistant 成功回答后，把本轮对话异步沉淀到用户独立 bank。
     * 写失败只记日志，不影响用户已经拿到的回答。
     */
    public void retainConversationTurnAsync(CurrentUserInfo currentUser,
                                            AssistantConversationSessionEntity session,
                                            AssistantContextAssembler.AssistantConversationContext context,
                                            AssistantChatRequest request,
                                            String assistantContent,
                                            AssistantConversationState finalState) {
        if (currentUser == null || currentUser.id() == null || session == null || request == null || !hasText(assistantContent)) {
            return;
        }
        assistantMemoryRetentionExecutor.execute(() -> {
            try {
                retainConversationTurn(currentUser, session, context, request, assistantContent, finalState);
            } catch (RuntimeException exception) {
                log.warn("Assistant 会话记忆写入 Hindsight 失败，userId={}，sessionId={}：{}",
                        currentUser.id(),
                        session.getId(),
                        sanitizeWarning(exception));
            }
        });
    }

    /**
     * 列出当前用户的 Assistant 会话记忆。
     * 优先走 DB 回退（按时间倒序），降级到 HTTP recall（语义搜索）。
     */
    public List<AssistantUserMemoryItem> listUserMemories(CurrentUserInfo currentUser, String query, int limit) {
        if (currentUser == null || currentUser.id() == null) {
            return List.of();
        }
        int effectiveLimit = Math.max(1, Math.min(limit, 200));
        try {
            MemoryProvider.MemoryScope scope = memoryProvider.assistantUserScope(currentUser.id());
            return memoryProvider.search(new MemoryProvider.MemoryQuery(
                            scope,
                            MemoryProvider.MemoryKind.CONVERSATION,
                            defaultString(query),
                            List.of(),
                            effectiveLimit
                    )).stream()
                    .filter(this::isConversationMemoryRecord)
                    .map(this::toUserMemoryItem)
                    .toList();
        } catch (RuntimeException exception) {
            log.warn("Assistant 用户记忆列表查询失败，userId={}：{}", currentUser.id(), sanitizeWarning(exception));
            return List.of();
        }
    }

    /**
     * 聚合读取当前用户的 Assistant 记忆管理视图。
     * conversationMemories 展示原始问答记忆；consolidatedFacts 展示 Hindsight 整理后的结构化事实。
     */
    public AssistantMemoryOverview getUserMemoryOverview(CurrentUserInfo currentUser, String query, int limit) {
        List<AssistantUserMemoryItem> conversationMemories = listUserMemories(currentUser, query, limit);
        List<AssistantMemoryFactItem> consolidatedFacts = listUserMemoryFacts(currentUser, query, limit);
        return new AssistantMemoryOverview(conversationMemories, consolidatedFacts);
    }

    /**
     * 读取当前用户 bank 中已经结构化整理出来的 world facts。
     * 这些内容才是 consolidation 后最应该让用户看到的结果。
     */
    public List<AssistantMemoryFactItem> listUserMemoryFacts(CurrentUserInfo currentUser, String query, int limit) {
        if (currentUser == null || currentUser.id() == null) {
            return List.of();
        }
        int effectiveLimit = Math.max(1, Math.min(limit, 200));
        MemoryProvider.MemoryScope scope = memoryProvider.assistantUserScope(currentUser.id());
        List<MemoryProvider.MemoryRecord> facts = memoryProvider.search(new MemoryProvider.MemoryQuery(
                scope,
                MemoryProvider.MemoryKind.FACT,
                defaultString(query),
                List.of(),
                effectiveLimit
        ));
        return facts.stream()
                .filter(this::isConsolidatedFact)
                .map(this::toMemoryFactItem)
                .toList();
    }

    /**
     * 删除当前用户的一条 Assistant 记忆。
     * 仅允许删除 hermes-conversation: 前缀的 documentId，防止越权删除其它类型记忆。
     */
    public void deleteUserMemory(CurrentUserInfo currentUser, String documentId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        String safeDocumentId = defaultString(documentId);
        if (!safeDocumentId.startsWith("hermes-conversation:")) {
            throw new IllegalArgumentException("只能删除 Assistant 会话记忆");
        }
        memoryProvider.delete(memoryProvider.assistantUserScope(currentUser.id()), safeDocumentId);
    }

    /**
     * 清空当前用户的全部 Assistant 记忆。
     * 返回实际删除的条数。
     */
    public int clearUserMemories(CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        List<AssistantUserMemoryItem> allMemories = listUserMemories(currentUser, "", 200);
        int deletedCount = 0;
        for (AssistantUserMemoryItem memory : allMemories) {
            try {
                memoryProvider.delete(memoryProvider.assistantUserScope(currentUser.id()), memory.documentId());
                deletedCount++;
            } catch (RuntimeException exception) {
                log.warn("Assistant 记忆删除失败，documentId={}：{}", memory.documentId(), sanitizeWarning(exception));
            }
        }
        return deletedCount;
    }

    /**
     * 触发当前用户 Assistant 记忆的整合（consolidation）。
     * 该接口只负责启动 Hindsight 异步任务，真正完成状态需要继续查询 operation。
     */
    public AssistantMemoryConsolidationTask startUserMemoryConsolidation(CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        MemoryProvider.MemoryConsolidationTask task =
                memoryProvider.startConsolidation(memoryProvider.assistantUserScope(currentUser.id()));
        return new AssistantMemoryConsolidationTask(task.operationId(), task.deduplicated());
    }

    /**
     * 查询当前用户某次记忆整理任务的真实执行状态。
     * 这样前端就不会把“接口已返回”误判成“整理已经完成”。
     */
    public AssistantMemoryConsolidationStatus getUserMemoryConsolidationStatus(CurrentUserInfo currentUser, String operationId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        if (defaultString(operationId).isBlank()) {
            throw new IllegalArgumentException("operationId 不能为空");
        }
        MemoryProvider.MemoryOperationStatus status = memoryProvider.getConsolidationStatus(
                memoryProvider.assistantUserScope(currentUser.id()), operationId);
        return new AssistantMemoryConsolidationStatus(
                status.operationId(),
                status.operationType(),
                status.status(),
                status.errorMessage(),
                status.retryCount(),
                status.nextRetryAt(),
                status.createdAt(),
                status.updatedAt(),
                status.completedAt()
        );
    }

    private RecallScope resolveScope(AssistantContextAssembler.AssistantConversationContext context,
                                     AssistantChatRequest request) {
        Long wikiSpaceId = context != null && context.wikiSpaceId() != null
                ? context.wikiSpaceId()
                : request == null ? null : request.wikiSpaceId();
        if (wikiSpaceId != null) {
            return RecallScope.wikiSpace(wikiSpaceId);
        }

        Long projectId = context != null && context.projectId() != null
                ? context.projectId()
                : request == null ? null : request.projectId();
        if (projectId != null) {
            return RecallScope.project(projectId);
        }
        return null;
    }

    /**
     * 当前用户记忆永远优先参与召回；如果页面还有项目 / Wiki 作用域，再叠加那部分 bank。
     */
    private List<MemoryProvider.MemoryScope> resolveRecallScopes(CurrentUserInfo currentUser, RecallScope scope) {
        List<MemoryProvider.MemoryScope> scopes = new ArrayList<>();
        if (currentUser != null && currentUser.id() != null) {
            scopes.add(memoryProvider.assistantUserScope(currentUser.id()));
        }
        if (scope == null) {
            return List.copyOf(scopes);
        }
        memoryProvider.sharedScope().ifPresent(scopes::add);
        return List.copyOf(scopes);
    }

    private List<MemoryProvider.MemoryRecord> deduplicateFacts(List<MemoryProvider.MemoryRecord> facts) {
        LinkedHashMap<String, MemoryProvider.MemoryRecord> values = new LinkedHashMap<>();
        for (MemoryProvider.MemoryRecord fact : facts == null ? List.<MemoryProvider.MemoryRecord>of() : facts) {
            if (fact == null) {
                continue;
            }
            String key = !defaultString(fact.id()).isBlank()
                    ? fact.id()
                    : defaultString(fact.summary());
            if (!key.isBlank()) {
                values.putIfAbsent(key, fact);
            }
        }
        return List.copyOf(values.values());
    }

    /**
     * Prompt 中只放小而稳的记忆摘要，避免把整块 Hindsight 原始内容直接压进上下文窗口。
     */
    private String renderMarkdown(List<MemoryProvider.MemoryRecord> facts) {
        StringBuilder builder = new StringBuilder();
        for (MemoryProvider.MemoryRecord fact : facts) {
            List<String> meta = new ArrayList<>();
            if (!defaultString(fact.sourceType()).isBlank()) {
                meta.add("来源：" + renderSourceType(fact.sourceType()));
            }
            if (!defaultString(fact.createdAt()).isBlank()) {
                meta.add("时间：" + fact.createdAt());
            }
            if (fact.tags() != null && !fact.tags().isEmpty()) {
                meta.add("标签：" + String.join(", ", fact.tags().stream().limit(3).toList()));
            }
            builder.append("- ")
                    .append(abbreviate(defaultString(fact.summary()), MAX_SUMMARY_LENGTH));
            if (!meta.isEmpty()) {
                builder.append("（").append(String.join("；", meta)).append("）");
            }
            builder.append('\n');
        }
        return builder.toString().trim();
    }

    private String renderSourceType(String sourceType) {
        return switch (defaultString(sourceType).toUpperCase()) {
            case "HERMES_USER_MEMORY", "ASSISTANT_USER_MEMORY" -> "用户会话记忆";
            case "WIKI_SPACE" -> "Wiki 空间";
            case "WIKI" -> "项目 Wiki";
            case "MEMORY" -> "共享记忆";
            default -> defaultString(sourceType);
        };
    }

    private void retainConversationTurn(CurrentUserInfo currentUser,
                                        AssistantConversationSessionEntity session,
                                        AssistantContextAssembler.AssistantConversationContext context,
                                        AssistantChatRequest request,
                                        String assistantContent,
                                        AssistantConversationState finalState) {
        memoryProvider.retain(
                memoryProvider.assistantUserScope(currentUser.id()),
                new MemoryProvider.MemoryDocument(
                        buildConversationDocumentId(session, finalState),
                        buildConversationTitle(request),
                        buildConversationContent(currentUser, context, request, assistantContent),
                        buildConversationTags(currentUser, context, request),
                        buildConversationMetadata(currentUser, session, context, request, finalState, assistantContent),
                        "assistant",
                        "conversation"
                )
        );
    }

    /**
     * 每轮问答都映射成一个稳定的 document_id，便于后续在 Hindsight 控制台里排查来源。
     */
    private String buildConversationDocumentId(AssistantConversationSessionEntity session,
                                               AssistantConversationState finalState) {
        return "hermes-conversation:"
                + defaultString(session.getClientConversationId())
                + ":turn:"
                + resolveTurnIndex(finalState);
    }

    private String buildConversationTitle(AssistantChatRequest request) {
        return "GitPilot 会话记忆：" + abbreviate(defaultString(request == null ? null : request.question()), 48);
    }

    /**
     * 会话记忆正文只保留用户问题和助手回答，不把内部 Prompt 拼装文本直接写进 Hindsight。
     */
    private String buildConversationContent(CurrentUserInfo currentUser,
                                            AssistantContextAssembler.AssistantConversationContext context,
                                            AssistantChatRequest request,
                                            String assistantContent) {
        StringBuilder builder = new StringBuilder();
        builder.append("用户：").append(resolveUserDisplayName(currentUser)).append('\n');
        builder.append("场景：").append(resolveConversationScopeLabel(context, request)).append('\n');
        builder.append("路由：").append(defaultString(request == null ? null : request.routeName())).append("\n\n");
        builder.append("用户问题：\n").append(buildDisplayedUserQuestion(request)).append("\n\n");
        builder.append("助手回答：\n").append(defaultString(assistantContent));
        return builder.toString().trim();
    }

    private List<String> buildConversationTags(CurrentUserInfo currentUser,
                                               AssistantContextAssembler.AssistantConversationContext context,
                                               AssistantChatRequest request) {
        LinkedHashSet<String> tags = new LinkedHashSet<>();
        tags.add("hermes");
        tags.add("source:hermes");
        if (currentUser != null && currentUser.id() != null) {
            tags.add("user:" + currentUser.id());
        }
        Long projectId = context != null && context.projectId() != null
                ? context.projectId()
                : request == null ? null : request.projectId();
        if (projectId != null) {
            tags.add("project:" + projectId);
        }
        Long spaceId = context != null && context.wikiSpaceId() != null
                ? context.wikiSpaceId()
                : request == null ? null : request.wikiSpaceId();
        if (spaceId != null) {
            tags.add("space:" + spaceId);
        }
        if (request != null && request.taskId() != null) {
            tags.add("task:" + request.taskId());
        }
        if (request != null && request.iterationId() != null) {
            tags.add("iteration:" + request.iterationId());
        }
        if (request != null && request.planId() != null) {
            tags.add("plan:" + request.planId());
        }
        if (request != null && hasText(request.routeName())) {
            tags.add("route:" + request.routeName().trim());
        }
        return List.copyOf(tags);
    }

    private Map<String, Object> buildConversationMetadata(CurrentUserInfo currentUser,
                                                          AssistantConversationSessionEntity session,
                                                          AssistantContextAssembler.AssistantConversationContext context,
                                                          AssistantChatRequest request,
                                                          AssistantConversationState finalState,
                                                          String assistantContent) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("memoryType", "conversation_turn");
        metadata.put("sessionId", session.getId());
        metadata.put("clientConversationId", defaultString(session.getClientConversationId()));
        metadata.put("turnIndex", resolveTurnIndex(finalState));
        putIfNotNull(metadata, "userId", currentUser == null ? null : currentUser.id());
        metadata.put("username", currentUser == null ? "" : defaultString(currentUser.username()));
        metadata.put("nickname", currentUser == null ? "" : defaultString(currentUser.nickname()));
        metadata.put("roleName", context == null ? "" : defaultString(context.roleName()));
        metadata.put("routeName", defaultString(request == null ? null : request.routeName()));
        putIfNotNull(metadata, "projectId", request == null ? null : request.projectId());
        putIfNotNull(metadata, "taskId", request == null ? null : request.taskId());
        putIfNotNull(metadata, "iterationId", request == null ? null : request.iterationId());
        putIfNotNull(metadata, "planId", request == null ? null : request.planId());
        putIfNotNull(metadata, "wikiSpaceId", request == null ? null : request.wikiSpaceId());
        putIfNotNull(metadata, "wikiPageId", request == null ? null : request.wikiPageId());
        metadata.put("question", abbreviate(buildDisplayedUserQuestion(request), 500));
        metadata.put("assistantSummary", abbreviate(defaultString(assistantContent), 500));
        return Map.copyOf(metadata);
    }

    private int resolveTurnIndex(AssistantConversationState finalState) {
        if (finalState == null || finalState.transcript() == null || finalState.transcript().isEmpty()) {
            return 1;
        }
        return Math.max(1, finalState.transcript().size() / 2);
    }

    private String buildDisplayedUserQuestion(AssistantChatRequest request) {
        if (request == null) {
            return "";
        }
        AssistantSelectionRequest selection = request.selection();
        if (selection == null) {
            return defaultString(request.question());
        }
        String resumeQuestion = hasText(selection.resumeQuestion())
                ? selection.resumeQuestion().trim()
                : defaultString(request.question());
        return "已确认对象："
                + defaultString(selection.entityType())
                + " #"
                + selection.entityId()
                + "\n继续处理："
                + resumeQuestion;
    }

    private String resolveUserDisplayName(CurrentUserInfo currentUser) {
        if (currentUser == null) {
            return "当前用户";
        }
        if (hasText(currentUser.nickname())) {
            return currentUser.nickname().trim();
        }
        return defaultString(currentUser.username());
    }

    private String resolveConversationScopeLabel(AssistantContextAssembler.AssistantConversationContext context,
                                                 AssistantChatRequest request) {
        if (request != null && request.taskId() != null) {
            return "任务 #" + request.taskId();
        }
        if (request != null && request.planId() != null) {
            return "测试计划 #" + request.planId();
        }
        if (request != null && request.iterationId() != null) {
            return "迭代 #" + request.iterationId();
        }
        Long spaceId = context != null && context.wikiSpaceId() != null
                ? context.wikiSpaceId()
                : request == null ? null : request.wikiSpaceId();
        Long pageId = context != null && context.wikiPageId() != null
                ? context.wikiPageId()
                : request == null ? null : request.wikiPageId();
        if (spaceId != null && pageId != null) {
            return "Wiki 页面 #" + pageId;
        }
        if (spaceId != null) {
            return "Wiki 空间 #" + spaceId;
        }
        Long projectId = context != null && context.projectId() != null
                ? context.projectId()
                : request == null ? null : request.projectId();
        if (projectId != null) {
            return "项目 #" + projectId;
        }
        return "全局入口";
    }

    private String sanitizeWarning(RuntimeException exception) {
        String message = exception == null ? "" : defaultString(exception.getMessage());
        if (message.isBlank()) {
            return "未知错误";
        }
        return message.length() > 180 ? message.substring(0, 180) : message;
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private AssistantUserMemoryItem toUserMemoryItem(MemoryProvider.MemoryRecord fact) {
        String rawContent = defaultString(fact.summary());
        ParsedMemoryContent parsed = parseMemoryContent(rawContent);
        Map<String, Object> metadata = fact.metadata() == null ? Map.of() : Map.copyOf(fact.metadata());
        String metadataQuestion = metadataString(metadata, "question");
        String metadataAnswer = metadataString(metadata, "assistantSummary");
        String documentId = firstNonBlank(metadataString(metadata, "documentId"), fact.id());
        String question = firstNonBlank(parsed.question, metadataQuestion);
        String answer = firstNonBlank(parsed.answer, metadataAnswer);
        String title = hasText(question) ? question : firstNonBlank(metadataString(metadata, "title"), rawContent);
        if (title.length() > 80) {
            title = title.substring(0, 80) + "...";
        }
        return new AssistantUserMemoryItem(
                defaultString(documentId),
                title,
                rawContent,
                question,
                answer,
                parsed.scene,
                defaultString(fact.createdAt()),
                metadata
        );
    }

    /**
     * 原始会话记忆必须是 Assistant conversation 文档，或者至少能解析出标准问答模板。
     * 否则 consolidation 后生成的事实会误混进“原始会话记忆”列表。
     */
    private boolean isConversationMemoryRecord(MemoryProvider.MemoryRecord fact) {
        if (fact == null) {
            return false;
        }
        Map<String, Object> metadata = fact.metadata() == null ? Map.of() : fact.metadata();
        Object documentId = metadata.get("documentId");
        if (documentId instanceof String documentIdValue && documentIdValue.startsWith("hermes-conversation:")) {
            return true;
        }
        return looksLikeConversationContent(fact.summary());
    }

    private boolean looksLikeConversationContent(String rawContent) {
        String normalized = defaultString(rawContent);
        return normalized.contains("用户问题：") && normalized.contains("助手回答：");
    }

    private String metadataString(Map<String, Object> metadata, String key) {
        if (metadata == null || key == null || key.isBlank()) {
            return "";
        }
        Object value = metadata.get(key);
        return value == null ? "" : defaultString(String.valueOf(value));
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    /**
     * 原始对话记忆会带完整“用户问题/助手回答”正文，而 consolidation 后的事实通常不会是这类模板。
     * 这里用轻量规则把整理后的摘要事实从同一 bank 中筛出来。
     */
    private boolean isConsolidatedFact(MemoryProvider.MemoryRecord fact) {
        if (fact == null || !hasText(fact.summary())) {
            return false;
        }
        String summary = defaultString(fact.summary());
        if (summary.contains("用户问题：") || summary.contains("助手回答：")) {
            return false;
        }
        Map<String, Object> metadata = fact.metadata() == null ? Map.of() : fact.metadata();
        Object documentId = metadata.get("documentId");
        if (documentId instanceof String documentIdValue && documentIdValue.startsWith("hermes-conversation:")) {
            return false;
        }
        return true;
    }

    private AssistantMemoryFactItem toMemoryFactItem(MemoryProvider.MemoryRecord fact) {
        Map<String, Object> metadata = fact.metadata() == null ? Map.of() : Map.copyOf(fact.metadata());
        return new AssistantMemoryFactItem(
                defaultString(fact.id()),
                defaultString(fact.summary()),
                defaultString(fact.predicate()),
                defaultString(fact.subject()),
                defaultString(fact.object()),
                defaultString(fact.sourceType()),
                defaultString(fact.createdAt()),
                fact.tags() == null ? List.of() : List.copyOf(fact.tags()),
                metadata
        );
    }

    /**
     * 从 Hindsight 存储的原始内容中解析出用户问题、助手回答和场景。
     * 存储格式为：
     * 用户：xxx
     * 场景：xxx
     * 路由：xxx
     *
     * 用户问题：
     * xxx
     *
     * 助手回答：
     * xxx
     */
    private ParsedMemoryContent parseMemoryContent(String rawContent) {
        if (!hasText(rawContent)) {
            return new ParsedMemoryContent("", "", "");
        }
        String scene = "";
        String question = "";
        String answer = "";

        String scenePrefix = "场景：";
        int sceneIdx = rawContent.indexOf(scenePrefix);
        if (sceneIdx >= 0) {
            int sceneEnd = rawContent.indexOf('\n', sceneIdx);
            if (sceneEnd > sceneIdx) {
                scene = rawContent.substring(sceneIdx + scenePrefix.length(), sceneEnd).trim();
            }
        }

        String questionMarker = "用户问题：\n";
        String answerMarker = "\n\n助手回答：\n";
        int qIdx = rawContent.indexOf(questionMarker);
        int aIdx = rawContent.indexOf(answerMarker);
        if (qIdx >= 0 && aIdx > qIdx) {
            question = rawContent.substring(qIdx + questionMarker.length(), aIdx).trim();
            answer = rawContent.substring(aIdx + answerMarker.length()).trim();
        } else if (qIdx >= 0) {
            question = rawContent.substring(qIdx + questionMarker.length()).trim();
        }

        return new ParsedMemoryContent(question, answer, scene);
    }

    private record ParsedMemoryContent(String question, String answer, String scene) {
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private void putIfNotNull(Map<String, Object> target, String key, Object value) {
        if (target == null || !hasText(key) || value == null) {
            return;
        }
        target.put(key.trim(), value);
    }

    private record RecallScope(String type, Long projectId, Long spaceId) {

        private static RecallScope project(Long projectId) {
            return new RecallScope("PROJECT", projectId, null);
        }

        private static RecallScope wikiSpace(Long spaceId) {
            return new RecallScope("WIKI_SPACE", null, spaceId);
        }

        private boolean wikiSpaceScope() {
            return "WIKI_SPACE".equals(type);
        }

        private List<String> recallTags() {
            if (wikiSpaceScope()) {
                return List.of("space:" + spaceId);
            }
            return List.of("project:" + projectId);
        }

        private String primaryRecallTag() {
            return recallTags().isEmpty() ? "" : recallTags().get(0);
        }
    }
}
