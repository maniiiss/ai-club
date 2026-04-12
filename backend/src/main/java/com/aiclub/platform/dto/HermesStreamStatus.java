package com.aiclub.platform.dto;

/**
 * Hermes 流式过程中的阶段状态事件。
 */
public record HermesStreamStatus(
        String stage,
        String message
) {
}
