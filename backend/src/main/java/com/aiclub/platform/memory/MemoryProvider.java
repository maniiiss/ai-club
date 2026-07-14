package com.aiclub.platform.memory;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 平台记忆 Provider 统一契约。
 *
 * 业务意图：GitPilot 只依赖记忆的业务语义，不感知 Hindsight、Redis 或其他存储实现。
 * Provider 负责 scope 映射、召回策略、持久化、删除和记忆整理等基础设施细节。
 */
public interface MemoryProvider {

    /** 当前用户的助手记忆作用域。 */
    MemoryScope assistantUserScope(Long userId);

    /** 当前部署显式配置的共享记忆作用域。 */
    Optional<MemoryScope> sharedScope();

    /** 按语义召回记忆；在线存储失败时由 Provider 自己决定是否降级。 */
    List<MemoryRecord> recall(MemoryQuery query);

    /** 查询记忆管理列表；Provider 可优先使用更稳定的本地快照。 */
    List<MemoryRecord> search(MemoryQuery query);

    /** 持久化一条记忆文档。 */
    void retain(MemoryScope scope, MemoryDocument document);

    /** 删除作用域下的一条记忆文档。 */
    void delete(MemoryScope scope, String documentId);

    /** 启动作用域下的记忆整理任务。 */
    MemoryConsolidationTask startConsolidation(MemoryScope scope);

    /** 查询记忆整理任务状态。 */
    MemoryOperationStatus getConsolidationStatus(MemoryScope scope, String operationId);

    /** 记忆召回用途，避免业务层依赖底层接口名称。 */
    enum MemoryKind {
        CONVERSATION,
        FACT
    }

    /** Provider 内部的抽象作用域，不暴露具体 bank id。 */
    record MemoryScope(String type, String key) {
        public MemoryScope {
            if (type == null || type.isBlank()) {
                throw new IllegalArgumentException("记忆作用域类型不能为空");
            }
            if (key == null || key.isBlank()) {
                throw new IllegalArgumentException("记忆作用域标识不能为空");
            }
            type = type.trim();
            key = key.trim();
        }
    }

    /** 记忆查询参数。 */
    record MemoryQuery(MemoryScope scope, MemoryKind kind, String query, List<String> tags, int limit) {
        public MemoryQuery {
            if (scope == null) {
                throw new IllegalArgumentException("记忆查询作用域不能为空");
            }
            if (kind == null) {
                throw new IllegalArgumentException("记忆查询类型不能为空");
            }
            query = query == null ? "" : query;
            tags = tags == null ? List.of() : List.copyOf(tags);
            limit = Math.max(1, Math.min(limit, 200));
        }
    }

    /** 待持久化的通用记忆文档。 */
    record MemoryDocument(String documentId,
                          String title,
                          String content,
                          List<String> tags,
                          Map<String, Object> metadata,
                          String sourceType,
                          String memoryType) {
        public MemoryDocument {
            documentId = documentId == null ? "" : documentId.trim();
            title = title == null ? "" : title;
            content = content == null ? "" : content;
            tags = tags == null ? List.of() : List.copyOf(tags);
            metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
            sourceType = sourceType == null ? "" : sourceType.trim();
            memoryType = memoryType == null ? "" : memoryType.trim();
        }
    }

    /** Provider 归一化后的记忆记录。 */
    record MemoryRecord(String id,
                        String type,
                        String subject,
                        String predicate,
                        String object,
                        String summary,
                        Double confidence,
                        String sourceType,
                        String createdAt,
                        List<String> tags,
                        Map<String, Object> metadata) {
        public MemoryRecord {
            id = id == null ? "" : id;
            type = type == null ? "" : type;
            subject = subject == null ? "" : subject;
            predicate = predicate == null ? "" : predicate;
            object = object == null ? "" : object;
            summary = summary == null ? "" : summary;
            sourceType = sourceType == null ? "" : sourceType;
            createdAt = createdAt == null ? "" : createdAt;
            tags = tags == null ? List.of() : List.copyOf(tags);
            metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
        }
    }

    /** 记忆整理任务启动结果。 */
    record MemoryConsolidationTask(String operationId, boolean deduplicated) {
    }

    /** 记忆整理任务状态。 */
    record MemoryOperationStatus(String operationId,
                                 String operationType,
                                 String status,
                                 String errorMessage,
                                 Integer retryCount,
                                 String nextRetryAt,
                                 String createdAt,
                                 String updatedAt,
                                 String completedAt) {
    }
}
