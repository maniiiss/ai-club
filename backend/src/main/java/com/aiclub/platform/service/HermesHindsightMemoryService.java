package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesConversationState;
import com.aiclub.platform.dto.HermesMemoryConsolidationStatus;
import com.aiclub.platform.dto.HermesMemoryFactItem;
import com.aiclub.platform.dto.HermesMemoryOverview;
import com.aiclub.platform.dto.HermesMemoryConsolidationTask;
import com.aiclub.platform.dto.HermesUserMemoryItem;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.HermesSelectionRequest;
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
 * 为 Hermes 问答补充 Hindsight 记忆召回与会话记忆写入。
 * 设计原则有两条：
 * 1. 问答前优先召回当前用户自己沉淀过的会话记忆，再补项目 / Wiki 记忆。
 * 2. 问答后异步写入 Hindsight，不让记忆旁路拖慢主问答响应。
 */
@Service
public class HermesHindsightMemoryService {

    private static final Logger log = LoggerFactory.getLogger(HermesHindsightMemoryService.class);
    private static final int MAX_FACTS_PER_BANK = 3;
    private static final int MAX_TOTAL_FACTS = 6;
    private static final int MAX_SUMMARY_LENGTH = 180;

    private final HindsightClientService hindsightClientService;
    private final HindsightMemoryFallbackService hindsightMemoryFallbackService;
    private final HindsightProperties hindsightProperties;
    private final WikiSpaceService wikiSpaceService;
    private final Executor hermesMemoryRetentionExecutor;

    @Autowired
    public HermesHindsightMemoryService(HindsightClientService hindsightClientService,
                                        HindsightMemoryFallbackService hindsightMemoryFallbackService,
                                        HindsightProperties hindsightProperties,
                                        WikiSpaceService wikiSpaceService,
                                        @Qualifier("executionTaskExecutor") Executor hermesMemoryRetentionExecutor) {
        this.hindsightClientService = hindsightClientService;
        this.hindsightMemoryFallbackService = hindsightMemoryFallbackService;
        this.hindsightProperties = hindsightProperties;
        this.wikiSpaceService = wikiSpaceService;
        this.hermesMemoryRetentionExecutor = hermesMemoryRetentionExecutor;
    }

    /**
     * 兼容直接 new 的测试场景，默认用同步执行器，避免额外等待异步线程。
     */
    public HermesHindsightMemoryService(HindsightClientService hindsightClientService,
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
                                             HermesContextAssembler.HermesConversationContext context,
                                             HermesChatRequest request) {
        String query = defaultString(request == null ? null : request.question());
        if (query.isBlank()) {
            return "";
        }
        RecallScope scope = resolveScope(context, request);
        List<String> bankIds = resolveRecallBanks(currentUser, scope);
        if (bankIds.isEmpty()) {
            return "";
        }
        List<String> recallTags = scope == null ? List.of() : scope.recallTags();

        List<HindsightClientService.MemoryWorldFact> collectedFacts = new ArrayList<>();
        for (String bankId : bankIds) {
            try {
                if (isHermesUserMemoryBank(bankId)) {
                    collectedFacts.addAll(recallUserConversationMemories(bankId, query, recallTags));
                } else {
                    collectedFacts.addAll(normalizeFactsFromBank(
                            bankId,
                            hindsightClientService.recallWorldFacts(bankId, query, recallTags, MAX_FACTS_PER_BANK)
                    ));
                }
            } catch (RuntimeException exception) {
                List<HindsightClientService.MemoryWorldFact> fallbackFacts = normalizeFactsFromBank(
                        bankId,
                        tryFallbackFacts(bankId, query, scope, exception)
                );
                if (!fallbackFacts.isEmpty()) {
                    collectedFacts.addAll(fallbackFacts);
                    continue;
                }
                log.warn("Hermes 记忆召回失败，bank={}，question={}: {}",
                        bankId,
                        abbreviate(query, 60),
                        sanitizeWarning(exception));
            }
            if (collectedFacts.size() >= MAX_TOTAL_FACTS) {
                break;
            }
        }

        List<HindsightClientService.MemoryWorldFact> facts = deduplicateFacts(collectedFacts);
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
    public String buildMemoryContextMarkdown(HermesContextAssembler.HermesConversationContext context,
                                             HermesChatRequest request) {
        return buildMemoryContextMarkdown(null, context, request);
    }

    /**
     * Hermes 成功回答后，把本轮对话异步沉淀到用户独立 bank。
     * 写失败只记日志，不影响用户已经拿到的回答。
     */
    public void retainConversationTurnAsync(CurrentUserInfo currentUser,
                                            HermesConversationSessionEntity session,
                                            HermesContextAssembler.HermesConversationContext context,
                                            HermesChatRequest request,
                                            String assistantContent,
                                            HermesConversationState finalState) {
        if (currentUser == null || currentUser.id() == null || session == null || request == null || !hasText(assistantContent)) {
            return;
        }
        hermesMemoryRetentionExecutor.execute(() -> {
            try {
                retainConversationTurn(currentUser, session, context, request, assistantContent, finalState);
            } catch (RuntimeException exception) {
                log.warn("Hermes 会话记忆写入 Hindsight 失败，userId={}，sessionId={}：{}",
                        currentUser.id(),
                        session.getId(),
                        sanitizeWarning(exception));
            }
        });
    }

    /**
     * 列出当前用户的 Hermes 会话记忆。
     * 优先走 DB 回退（按时间倒序），降级到 HTTP recall（语义搜索）。
     */
    public List<HermesUserMemoryItem> listUserMemories(CurrentUserInfo currentUser, String query, int limit) {
        if (currentUser == null || currentUser.id() == null) {
            return List.of();
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        int effectiveLimit = Math.max(1, Math.min(limit, 200));

        if (hindsightMemoryFallbackService.isEnabled()) {
            try {
                List<HindsightClientService.MemoryWorldFact> facts = hindsightMemoryFallbackService.searchFacts(
                        List.of(bankId), defaultString(query), effectiveLimit
                );
                return facts.stream()
                        .filter(this::isConversationMemoryFact)
                        .map(this::toUserMemoryItem)
                        .toList();
            } catch (RuntimeException exception) {
                log.warn("Hermes 用户记忆 DB 回退查询失败，降级到 HTTP recall：{}", sanitizeWarning(exception));
            }
        }

        try {
            List<HindsightClientService.MemoryRecallHit> hits = hindsightClientService.recallMemories(
                    bankId, defaultString(query), List.of(), effectiveLimit
            );
            return hits.stream()
                    .filter(this::isConversationMemoryHit)
                    .map(hit -> {
                        String rawContent = defaultString(hit.snippet());
                        ParsedMemoryContent parsed = parseMemoryContent(rawContent);
                        String title = hasText(parsed.question) ? parsed.question : defaultString(hit.title());
                        if (title.length() > 80) {
                            title = title.substring(0, 80) + "...";
                        }
                        return new HermesUserMemoryItem(
                                defaultString(hit.documentId()),
                                title,
                                rawContent,
                                parsed.question,
                                parsed.answer,
                                parsed.scene,
                                "",
                                Map.of()
                        );
                    })
                    .toList();
        } catch (RuntimeException exception) {
            log.warn("Hermes 用户记忆列表查询失败，userId={}：{}", currentUser.id(), sanitizeWarning(exception));
            return List.of();
        }
    }

    /**
     * 聚合读取当前用户的 Hermes 记忆管理视图。
     * conversationMemories 展示原始问答记忆；consolidatedFacts 展示 Hindsight 整理后的结构化事实。
     */
    public HermesMemoryOverview getUserMemoryOverview(CurrentUserInfo currentUser, String query, int limit) {
        List<HermesUserMemoryItem> conversationMemories = listUserMemories(currentUser, query, limit);
        List<HermesMemoryFactItem> consolidatedFacts = listUserMemoryFacts(currentUser, query, limit);
        return new HermesMemoryOverview(conversationMemories, consolidatedFacts);
    }

    /**
     * 读取当前用户 bank 中已经结构化整理出来的 world facts。
     * 这些内容才是 consolidation 后最应该让用户看到的结果。
     */
    public List<HermesMemoryFactItem> listUserMemoryFacts(CurrentUserInfo currentUser, String query, int limit) {
        if (currentUser == null || currentUser.id() == null) {
            return List.of();
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        int effectiveLimit = Math.max(1, Math.min(limit, 200));
        List<HindsightClientService.MemoryWorldFact> facts;
        if (hindsightMemoryFallbackService.isEnabled()) {
            try {
                facts = hindsightMemoryFallbackService.searchFacts(List.of(bankId), defaultString(query), effectiveLimit);
            } catch (RuntimeException exception) {
                log.warn("Hermes 整理后记忆 DB 回退查询失败，降级到 HTTP recall：{}", sanitizeWarning(exception));
                facts = recallUserMemoryFacts(bankId, query, effectiveLimit);
            }
        } else {
            facts = recallUserMemoryFacts(bankId, query, effectiveLimit);
        }
        return facts.stream()
                .filter(this::isConsolidatedFact)
                .map(this::toMemoryFactItem)
                .toList();
    }

    /**
     * 删除当前用户的一条 Hermes 记忆。
     * 仅允许删除 hermes-conversation: 前缀的 documentId，防止越权删除其它类型记忆。
     */
    public void deleteUserMemory(CurrentUserInfo currentUser, String documentId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        String safeDocumentId = defaultString(documentId);
        if (!safeDocumentId.startsWith("hermes-conversation:")) {
            throw new IllegalArgumentException("只能删除 Hermes 会话记忆");
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        hindsightClientService.deleteDocument(bankId, safeDocumentId);
    }

    /**
     * 清空当前用户的全部 Hermes 记忆。
     * 返回实际删除的条数。
     */
    public int clearUserMemories(CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        List<HermesUserMemoryItem> allMemories = listUserMemories(currentUser, "", 200);
        int deletedCount = 0;
        for (HermesUserMemoryItem memory : allMemories) {
            try {
                hindsightClientService.deleteDocument(bankId, memory.documentId());
                deletedCount++;
            } catch (RuntimeException exception) {
                log.warn("Hermes 记忆删除失败，documentId={}：{}", memory.documentId(), sanitizeWarning(exception));
            }
        }
        return deletedCount;
    }

    /**
     * 触发当前用户 Hermes 记忆的整合（consolidation）。
     * 该接口只负责启动 Hindsight 异步任务，真正完成状态需要继续查询 operation。
     */
    public HermesMemoryConsolidationTask startUserMemoryConsolidation(CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        HindsightClientService.MemoryConsolidationTask task = hindsightClientService.startBankConsolidation(bankId);
        return new HermesMemoryConsolidationTask(task.operationId(), task.deduplicated());
    }

    /**
     * 查询当前用户某次记忆整理任务的真实执行状态。
     * 这样前端就不会把“接口已返回”误判成“整理已经完成”。
     */
    public HermesMemoryConsolidationStatus getUserMemoryConsolidationStatus(CurrentUserInfo currentUser, String operationId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        if (defaultString(operationId).isBlank()) {
            throw new IllegalArgumentException("operationId 不能为空");
        }
        String bankId = hindsightProperties.hermesUserMemoryBankId(currentUser.id());
        HindsightClientService.AsyncOperationStatus status = hindsightClientService.getBankOperationStatus(bankId, operationId);
        return new HermesMemoryConsolidationStatus(
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

    private RecallScope resolveScope(HermesContextAssembler.HermesConversationContext context,
                                     HermesChatRequest request) {
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
    private List<String> resolveRecallBanks(CurrentUserInfo currentUser, RecallScope scope) {
        LinkedHashSet<String> bankIds = new LinkedHashSet<>();
        if (currentUser != null && currentUser.id() != null) {
            bankIds.add(hindsightProperties.hermesUserMemoryBankId(currentUser.id()));
        }
        if (scope == null) {
            return List.copyOf(bankIds);
        }
        if (scope.wikiSpaceScope()) {
            bankIds.add(hindsightProperties.wikiSpaceBankId(scope.spaceId()));
            return List.copyOf(bankIds);
        }

        Long projectId = scope.projectId();
        bankIds.add(hindsightProperties.memoryFactProjectBankId(projectId));
        WikiSpaceService.WikiProjectGraphProjection projection = wikiSpaceService.buildProjectGraphProjection(projectId);
        if (projection != null) {
            projection.spaces().stream()
                    .map(space -> space == null ? null : space.getId())
                    .filter(Objects::nonNull)
                    .map(hindsightProperties::wikiSpaceBankId)
                    .forEach(bankIds::add);
            projection.pages().stream()
                    .map(page -> page == null || page.getSpace() == null ? null : page.getSpace().getId())
                    .filter(Objects::nonNull)
                    .map(hindsightProperties::wikiSpaceBankId)
                    .forEach(bankIds::add);
        }
        if (hindsightProperties.hasMemoryFactSharedBankId()) {
            bankIds.add(hindsightProperties.memoryFactSharedBankId());
        }
        return List.copyOf(bankIds);
    }

    private List<HindsightClientService.MemoryWorldFact> tryFallbackFacts(String bankId,
                                                                          String query,
                                                                          RecallScope scope,
                                                                          RuntimeException exception) {
        if (!hindsightMemoryFallbackService.isEnabled()) {
            return List.of();
        }
        try {
            List<HindsightClientService.MemoryWorldFact> facts = hindsightMemoryFallbackService.searchFacts(
                    List.of(bankId),
                    query,
                    scope == null ? "" : scope.primaryRecallTag(),
                    MAX_FACTS_PER_BANK
            );
            if (!facts.isEmpty()) {
                log.warn("Hermes 记忆召回已回退到 Hindsight 库内快照，bank={}：{}",
                        bankId,
                        sanitizeWarning(exception));
            }
            return facts;
        } catch (RuntimeException fallbackException) {
            log.warn("Hermes 记忆召回的 HTTP 与库内快照都失败，bank={}：{}",
                    bankId,
                    sanitizeWarning(fallbackException));
            return List.of();
        }
    }

    /**
     * 用户会话记忆优先走通用 memories recall。
     * 这比 world facts recall 更适合“我明天要去公司拿电脑”这类私人提醒式文本。
     */
    private List<HindsightClientService.MemoryWorldFact> recallUserConversationMemories(String bankId,
                                                                                        String query,
                                                                                        List<String> recallTags) {
        return hindsightClientService.recallMemories(bankId, query, recallTags, MAX_FACTS_PER_BANK).stream()
                .map(hit -> new HindsightClientService.MemoryWorldFact(
                        defaultString(hit.documentId()),
                        "memory",
                        "",
                        "",
                        "",
                        hasText(hit.snippet()) ? hit.snippet() : defaultString(hit.title()),
                        hit.score(),
                        "HERMES_USER_MEMORY",
                        "",
                        recallTags,
                        Map.of(
                                "bankId", bankId,
                                "documentId", defaultString(hit.documentId()),
                                "title", defaultString(hit.title())
                        )
                ))
                .filter(fact -> hasText(fact.summary()))
                .toList();
    }

    /**
     * 当 Hindsight 在线 recall 只给出通用 sourceType 时，这里按 bank 补齐更可读的来源类型。
     */
    private List<HindsightClientService.MemoryWorldFact> normalizeFactsFromBank(String bankId,
                                                                                List<HindsightClientService.MemoryWorldFact> facts) {
        if (facts == null || facts.isEmpty()) {
            return List.of();
        }
        return facts.stream()
                .map(fact -> {
                    LinkedHashMap<String, Object> metadata = new LinkedHashMap<>(fact.metadata() == null ? Map.of() : fact.metadata());
                    metadata.putIfAbsent("bankId", bankId);
                    return new HindsightClientService.MemoryWorldFact(
                            fact.id(),
                            fact.type(),
                            fact.subject(),
                            fact.predicate(),
                            fact.object(),
                            fact.summary(),
                            fact.confidence(),
                            normalizeSourceType(bankId, fact.sourceType()),
                            fact.createdAt(),
                            fact.tags(),
                            Map.copyOf(metadata)
                    );
                })
                .toList();
    }

    private String normalizeSourceType(String bankId, String sourceType) {
        String normalized = defaultString(sourceType).toUpperCase();
        if (!normalized.isBlank() && !"HINDSIGHT_RECALL".equals(normalized) && !"WORLD".equals(normalized)) {
            return normalized;
        }
        String normalizedBankId = defaultString(bankId);
        if (normalizedBankId.contains(":hermes:user:")) {
            return "HERMES_USER_MEMORY";
        }
        if (normalizedBankId.contains(":wiki:space:")) {
            return "WIKI_SPACE";
        }
        if (normalizedBankId.contains(":wiki:project:")) {
            return "WIKI";
        }
        return "MEMORY";
    }

    private boolean isHermesUserMemoryBank(String bankId) {
        return defaultString(bankId).contains(":hermes:user:");
    }

    private List<HindsightClientService.MemoryWorldFact> deduplicateFacts(List<HindsightClientService.MemoryWorldFact> facts) {
        LinkedHashMap<String, HindsightClientService.MemoryWorldFact> values = new LinkedHashMap<>();
        for (HindsightClientService.MemoryWorldFact fact : facts == null ? List.<HindsightClientService.MemoryWorldFact>of() : facts) {
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
    private String renderMarkdown(List<HindsightClientService.MemoryWorldFact> facts) {
        StringBuilder builder = new StringBuilder();
        for (HindsightClientService.MemoryWorldFact fact : facts) {
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
            case "HERMES_USER_MEMORY" -> "用户会话记忆";
            case "WIKI_SPACE" -> "Wiki 空间";
            case "WIKI" -> "项目 Wiki";
            case "MEMORY" -> "共享记忆";
            default -> defaultString(sourceType);
        };
    }

    private void retainConversationTurn(CurrentUserInfo currentUser,
                                        HermesConversationSessionEntity session,
                                        HermesContextAssembler.HermesConversationContext context,
                                        HermesChatRequest request,
                                        String assistantContent,
                                        HermesConversationState finalState) {
        hindsightClientService.retainHermesConversationMemory(
                currentUser.id(),
                buildConversationDocumentId(session, finalState),
                buildConversationTitle(request),
                buildConversationContent(currentUser, context, request, assistantContent),
                buildConversationTags(currentUser, context, request),
                buildConversationMetadata(currentUser, session, context, request, finalState, assistantContent)
        );
    }

    /**
     * 每轮问答都映射成一个稳定的 document_id，便于后续在 Hindsight 控制台里排查来源。
     */
    private String buildConversationDocumentId(HermesConversationSessionEntity session,
                                               HermesConversationState finalState) {
        return "hermes-conversation:"
                + defaultString(session.getClientConversationId())
                + ":turn:"
                + resolveTurnIndex(finalState);
    }

    private String buildConversationTitle(HermesChatRequest request) {
        return "Hermes 会话记忆：" + abbreviate(defaultString(request == null ? null : request.question()), 48);
    }

    /**
     * 会话记忆正文只保留用户问题和助手回答，不把内部 Prompt 拼装文本直接写进 Hindsight。
     */
    private String buildConversationContent(CurrentUserInfo currentUser,
                                            HermesContextAssembler.HermesConversationContext context,
                                            HermesChatRequest request,
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
                                               HermesContextAssembler.HermesConversationContext context,
                                               HermesChatRequest request) {
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
                                                          HermesConversationSessionEntity session,
                                                          HermesContextAssembler.HermesConversationContext context,
                                                          HermesChatRequest request,
                                                          HermesConversationState finalState,
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

    private int resolveTurnIndex(HermesConversationState finalState) {
        if (finalState == null || finalState.transcript() == null || finalState.transcript().isEmpty()) {
            return 1;
        }
        return Math.max(1, finalState.transcript().size() / 2);
    }

    private String buildDisplayedUserQuestion(HermesChatRequest request) {
        if (request == null) {
            return "";
        }
        HermesSelectionRequest selection = request.selection();
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

    private String resolveConversationScopeLabel(HermesContextAssembler.HermesConversationContext context,
                                                 HermesChatRequest request) {
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

    private HermesUserMemoryItem toUserMemoryItem(HindsightClientService.MemoryWorldFact fact) {
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
        return new HermesUserMemoryItem(
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

    private List<HindsightClientService.MemoryWorldFact> recallUserMemoryFacts(String bankId, String query, int limit) {
        try {
            return hindsightClientService.recallWorldFacts(bankId, defaultString(query), List.of(), limit);
        } catch (RuntimeException exception) {
            log.warn("Hermes 整理后记忆 HTTP recall 失败，bank={}：{}", bankId, sanitizeWarning(exception));
            return List.of();
        }
    }

    /**
     * 原始会话记忆必须是 Hermes conversation 文档，或者至少能解析出标准问答模板。
     * 否则 consolidation 后生成的事实会误混进“原始会话记忆”列表。
     */
    private boolean isConversationMemoryFact(HindsightClientService.MemoryWorldFact fact) {
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

    private boolean isConversationMemoryHit(HindsightClientService.MemoryRecallHit hit) {
        if (hit == null) {
            return false;
        }
        if (defaultString(hit.documentId()).startsWith("hermes-conversation:")) {
            return true;
        }
        return looksLikeConversationContent(hit.snippet());
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
    private boolean isConsolidatedFact(HindsightClientService.MemoryWorldFact fact) {
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

    private HermesMemoryFactItem toMemoryFactItem(HindsightClientService.MemoryWorldFact fact) {
        Map<String, Object> metadata = fact.metadata() == null ? Map.of() : Map.copyOf(fact.metadata());
        return new HermesMemoryFactItem(
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
