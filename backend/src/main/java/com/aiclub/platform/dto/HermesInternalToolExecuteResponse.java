package com.aiclub.platform.dto;

/**
 * backend 内部 MCP 工具执行接口返回给 Python bridge 的最小结果。
 */
public record HermesInternalToolExecuteResponse(
        String message
) {
}
