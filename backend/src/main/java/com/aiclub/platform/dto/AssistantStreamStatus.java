package com.aiclub.platform.dto;

/**
 * Assistant 流式过程中的阶段状态事件。
 */
public record AssistantStreamStatus(
        String stage,
        String message
) {
}
