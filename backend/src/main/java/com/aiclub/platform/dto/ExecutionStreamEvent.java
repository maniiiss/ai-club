package com.aiclub.platform.dto;

/**
 * 前端消费的执行步骤流事件。
 * event id 使用运行内 sequenceNo，便于断线续传。
 */
public record ExecutionStreamEvent(
        Long id,
        Long runId,
        Long stepId,
        Integer stepNo,
        String eventType,
        String streamKind,
        String text,
        String currentCommand,
        Integer progressPercent,
        String summary,
        Long artifactId,
        String createdAt
) {
}
