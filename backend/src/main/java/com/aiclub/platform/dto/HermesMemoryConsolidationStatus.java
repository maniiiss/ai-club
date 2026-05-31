package com.aiclub.platform.dto;

/**
 * Hermes 记忆整理任务的当前执行状态。
 * 这里统一收敛 Hindsight 异步 operation 的关键字段，避免前端直接依赖外部接口细节。
 */
public record HermesMemoryConsolidationStatus(
        String operationId,
        String operationType,
        String status,
        String errorMessage,
        Integer retryCount,
        String nextRetryAt,
        String createdAt,
        String updatedAt,
        String completedAt
) {
}
