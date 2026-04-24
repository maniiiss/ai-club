package com.aiclub.platform.dto;

import java.util.List;

/**
 * 事实列表响应。
 * 通过 scopeType / scopeId 标识当前证据面板是节点、边还是搜索结果，前端可据此渲染不同标题。
 */
public record MemoryFactFactsResponse(
        Long projectId,
        String scopeType,
        String scopeId,
        String query,
        Integer factCount,
        List<String> warnings,
        List<MemoryFactItem> facts
) {
}
