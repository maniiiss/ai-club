package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 平台工具执行结果。
 */
public record PlatformToolResult(
        String toolCode,
        String toolName,
        String summary,
        List<PlatformToolCandidate> candidates,
        List<PlatformToolAction> actions,
        Map<String, Object> metadata
) {
}
