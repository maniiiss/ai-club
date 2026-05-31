package com.aiclub.platform.dto;

/**
 * Hermes 记忆整理任务的启动结果。
 * 后端会把 Hindsight 返回的 operation_id 透传给前端，便于继续轮询真实执行状态。
 */
public record HermesMemoryConsolidationTask(
        String operationId,
        boolean deduplicated
) {
}
