package com.aiclub.platform.dto;

/**
 * 前端消费的执行步骤流事件。
 * event id 使用运行内 sequenceNo，stepName 直接随事件下发，避免前端在快照尚未刷新时只能按步骤号兜底展示。
 */
public record ExecutionStreamEvent(
        Long id,
        Long runId,
        Long stepId,
        Integer stepNo,
        String stepName,
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
