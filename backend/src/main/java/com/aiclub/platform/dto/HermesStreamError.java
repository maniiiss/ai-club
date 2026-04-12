package com.aiclub.platform.dto;

/**
 * 流式回答失败时返回的错误事件。
 */
public record HermesStreamError(
        String message
) {
}
