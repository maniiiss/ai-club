package com.aiclub.platform.service;

import com.aiclub.platform.dto.request.HermesChatRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/**
 * 为 Hermes 问答补充 Hindsight 记忆召回结果。
 * 这里的业务目标不是替代 MCP 工具，而是在问答开始前先把当前项目 / Wiki 空间里
 * 与问题语义接近的稳定事实塞进提示词，帮助助手优先利用已有记忆作答。
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

    public HermesHindsightMemoryService(HindsightClientService hindsightClientService,
                                        HindsightMemoryFallbackService hindsightMemoryFallbackService,
                                        HindsightProperties hindsightProperties,
                                        WikiSpaceService wikiSpaceService) {
        this.hindsightClientService = hindsightClientService;
        this.hindsightMemoryFallbackService = hindsightMemoryFallbackService;
        this.hindsightProperties = hindsightProperties;
        this.wikiSpaceService = wikiSpaceService;
    }

    /**
     * 根据当前会话作用域召回一小段可直接注入 Prompt 的记忆摘要。
     * 召回失败时降级为空串，避免 Hindsight 异常直接打断 Hermes 主问答链路。
     */
    public String buildMemoryContextMarkdown(HermesContextAssembler.HermesConversationContext context,
                                             HermesChatRequest request) {
        String query = defaultString(request == null ? null : request.question());
        if (query.isBlank()) {
            return "";
        }
        RecallScope scope = resolveScope(context, request);
        if (scope == null) {
            return "";
        }
        List<String> bankIds = resolveRecallBanks(scope);
        if (bankIds.isEmpty()) {
            return "";
        }

        List<HindsightClientService.MemoryWorldFact> collectedFacts = new ArrayList<>();
        for (String bankId : bankIds) {
            try {
                collectedFacts.addAll(hindsightClientService.recallWorldFacts(
                        bankId,
                        query,
                        scope.recallTags(),
                        MAX_FACTS_PER_BANK
                ));
            } catch (RuntimeException exception) {
                List<HindsightClientService.MemoryWorldFact> fallbackFacts = tryFallbackFacts(bankId, query, scope, exception);
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
     * 项目作用域尽量与记忆事实图保持同一批 recall bank，
     * 这样 Hermes 问答和事实视图看到的是同一份 Hindsight 记忆来源。
     */
    private List<String> resolveRecallBanks(RecallScope scope) {
        LinkedHashSet<String> bankIds = new LinkedHashSet<>();
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
                    scope.primaryRecallTag(),
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
            case "WIKI_SPACE" -> "Wiki 空间";
            case "WIKI" -> "项目 Wiki";
            case "MEMORY" -> "共享记忆";
            default -> defaultString(sourceType);
        };
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
