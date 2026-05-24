package com.aiclub.platform.dto;

/**
 * 服务器终端会话创建结果。
 */
public record ServerTerminalSessionCreated(
        String sessionId,
        int cols,
        int rows
) {
}
