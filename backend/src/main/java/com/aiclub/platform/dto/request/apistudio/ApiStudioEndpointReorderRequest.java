package com.aiclub.platform.dto.request.apistudio;

import java.util.List;

/**
 * 目录拖拽排序/跨目录移动 API 请求。
 */
public record ApiStudioEndpointReorderRequest(List<Item> items) {

    public record Item(Long endpointId, Long directoryId, Integer sortOrder) {
    }
}
