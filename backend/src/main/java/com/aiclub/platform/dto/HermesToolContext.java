package com.aiclub.platform.dto;

import java.util.List;

/**
 * Hermes 工具编排上下文。
 */
public record HermesToolContext(
        List<PlatformToolResult> toolResults,
        List<HermesActionSummary> actions,
        String contextMarkdown
) {
}
