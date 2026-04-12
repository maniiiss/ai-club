package com.aiclub.platform.dto;

import java.util.List;

/**
 * 前端开始接收流式回答前的元信息事件。
 */
public record HermesStreamMeta(
        String scopeKey,
        String roleName,
        List<HermesReferenceSummary> references,
        List<String> suggestions
) {
}
