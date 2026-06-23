package com.aiclub.platform.dto.request.apistudio;

import java.util.List;

/**
 * 目录拖拽排序/跨目录移动请求。
 * 每个 item 描述一个目录的新 parentId 和 sortOrder。
 */
public record ApiStudioDirectoryReorderRequest(List<Item> items) {

    public record Item(Long directoryId, Long parentId, Integer sortOrder) {
    }
}
