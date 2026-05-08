package com.aiclub.platform.dto;

/**
 * `/apis` 页面展示的 Yaade 项目绑定摘要。
 */
public record YaadeProjectBindingSummary(
        Long projectId,
        boolean publicSpace,
        boolean exists,
        Long yaadeCollectionId,
        String yaadeGroupName,
        String status,
        String collectionName,
        String archivedName,
        String lastSyncedAt
) {
}
