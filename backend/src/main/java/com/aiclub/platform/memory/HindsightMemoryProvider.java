package com.aiclub.platform.memory;

import com.aiclub.platform.service.HindsightClientService;
import com.aiclub.platform.service.HindsightMemoryFallbackService;
import com.aiclub.platform.service.HindsightProperties;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Hindsight 记忆 Provider 适配器。
 *
 * 业务意图：将 Hindsight 的 bank、HTTP DTO 和数据库回退全部封装在基础设施边界内，
 * 上层 Assistant 不再直接依赖 Hindsight 客户端和配置对象。
 */
@Service
public class HindsightMemoryProvider implements MemoryProvider {

    private final HindsightClientService hindsightClientService;
    private final HindsightMemoryFallbackService fallbackService;
    private final HindsightProperties properties;

    public HindsightMemoryProvider(HindsightClientService hindsightClientService,
                                   HindsightMemoryFallbackService fallbackService,
                                   HindsightProperties properties) {
        this.hindsightClientService = hindsightClientService;
        this.fallbackService = fallbackService;
        this.properties = properties;
    }

    @Override
    public MemoryScope assistantUserScope(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("记忆用户标识不能为空");
        }
        return new MemoryScope("assistant-user", String.valueOf(userId));
    }

    @Override
    public Optional<MemoryScope> sharedScope() {
        return properties.hasMemoryFactSharedBankId()
                ? Optional.of(new MemoryScope("shared", properties.memoryFactSharedBankId()))
                : Optional.empty();
    }

    @Override
    public List<MemoryRecord> recall(MemoryQuery query) {
        try {
            return query.kind() == MemoryKind.CONVERSATION
                    ? recallConversation(query)
                    : recallFacts(query);
        } catch (RuntimeException exception) {
            return fallback(query, exception);
        }
    }

    @Override
    public List<MemoryRecord> search(MemoryQuery query) {
        if (fallbackService.isEnabled()) {
            try {
                return mapFacts(searchFallbackFacts(query), query.scope());
            } catch (RuntimeException ignored) {
                // 本地快照不可用时继续走在线 Hindsight 查询，保持管理页可用。
            }
        }
        return recall(query);
    }

    @Override
    public void retain(MemoryScope scope, MemoryDocument document) {
        hindsightClientService.retainAssistantConversationMemory(
                Long.valueOf(scope.key()),
                document.documentId(),
                document.title(),
                document.content(),
                document.tags(),
                document.metadata()
        );
    }

    @Override
    public void delete(MemoryScope scope, String documentId) {
        hindsightClientService.deleteDocument(resolveBankId(scope), documentId);
    }

    @Override
    public MemoryConsolidationTask startConsolidation(MemoryScope scope) {
        HindsightClientService.MemoryConsolidationTask task =
                hindsightClientService.startBankConsolidation(resolveBankId(scope));
        return new MemoryConsolidationTask(task.operationId(), task.deduplicated());
    }

    @Override
    public MemoryOperationStatus getConsolidationStatus(MemoryScope scope, String operationId) {
        HindsightClientService.AsyncOperationStatus status =
                hindsightClientService.getBankOperationStatus(resolveBankId(scope), operationId);
        return new MemoryOperationStatus(
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

    private List<MemoryRecord> recallConversation(MemoryQuery query) {
        String bankId = resolveBankId(query.scope());
        return hindsightClientService.recallMemories(bankId, query.query(), query.tags(), query.limit()).stream()
                .map(hit -> new MemoryRecord(
                        defaultString(hit.documentId()),
                        "memory",
                        "",
                        "",
                        "",
                        hasText(hit.snippet()) ? hit.snippet() : defaultString(hit.title()),
                        hit.score(),
                        "ASSISTANT_USER_MEMORY",
                        "",
                        query.tags(),
                        Map.of(
                                "bankId", bankId,
                                "documentId", defaultString(hit.documentId()),
                                "title", defaultString(hit.title())
                        )
                ))
                .filter(record -> hasText(record.summary()))
                .toList();
    }

    private List<MemoryRecord> recallFacts(MemoryQuery query) {
        return mapFacts(hindsightClientService.recallWorldFacts(
                resolveBankId(query.scope()), query.query(), query.tags(), query.limit()
        ), query.scope());
    }

    private List<MemoryRecord> fallback(MemoryQuery query, RuntimeException cause) {
        if (!fallbackService.isEnabled()) {
            return List.of();
        }
        try {
            return mapFacts(searchFallbackFacts(query), query.scope());
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private List<HindsightClientService.MemoryWorldFact> searchFallbackFacts(MemoryQuery query) {
        String bankId = resolveBankId(query.scope());
        if (query.tags().isEmpty()) {
            return fallbackService.searchFacts(List.of(bankId), query.query(), query.limit());
        }
        return fallbackService.searchFacts(List.of(bankId), query.query(), query.tags().get(0), query.limit());
    }

    private List<MemoryRecord> mapFacts(List<HindsightClientService.MemoryWorldFact> facts, MemoryScope scope) {
        if (facts == null || facts.isEmpty()) {
            return List.of();
        }
        List<MemoryRecord> records = new ArrayList<>();
        for (HindsightClientService.MemoryWorldFact fact : facts) {
            if (fact == null) {
                continue;
            }
            Map<String, Object> metadata = new LinkedHashMap<>(fact.metadata() == null ? Map.of() : fact.metadata());
            metadata.putIfAbsent("bankId", resolveBankId(scope));
            records.add(new MemoryRecord(
                    fact.id(),
                    fact.type(),
                    fact.subject(),
                    fact.predicate(),
                    fact.object(),
                    fact.summary(),
                    fact.confidence(),
                    normalizeSourceType(fact.sourceType(), metadata),
                    fact.createdAt(),
                    fact.tags(),
                    Map.copyOf(metadata)
            ));
        }
        return List.copyOf(records);
    }

    private String resolveBankId(MemoryScope scope) {
        if (scope == null) {
            throw new IllegalArgumentException("记忆作用域不能为空");
        }
        return switch (scope.type()) {
            case "assistant-user" -> properties.assistantUserMemoryBankId(Long.valueOf(scope.key()));
            case "shared" -> scope.key();
            default -> throw new IllegalArgumentException("Hindsight Provider 不支持的记忆作用域: " + scope.type());
        };
    }

    private String normalizeSourceType(String sourceType, Map<String, Object> metadata) {
        String normalized = defaultString(sourceType).toUpperCase();
        if (!normalized.isBlank() && !"HINDSIGHT_RECALL".equals(normalized) && !"WORLD".equals(normalized)) {
            return normalized;
        }
        Object bankId = metadata.get("bankId");
        String bank = defaultString(bankId == null ? "" : String.valueOf(bankId));
        if (bank.contains(":hermes:user:")) {
            return "ASSISTANT_USER_MEMORY";
        }
        if (bank.contains(":wiki:space:")) {
            return "WIKI_SPACE";
        }
        if (bank.contains(":wiki:project:")) {
            return "WIKI";
        }
        return "MEMORY";
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
