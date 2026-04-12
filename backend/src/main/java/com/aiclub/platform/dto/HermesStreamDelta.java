package com.aiclub.platform.dto;

/**
 * 流式回答中的文本增量事件。
 */
public record HermesStreamDelta(
        String content
) {
}
