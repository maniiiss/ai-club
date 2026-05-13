package com.aiclub.platform.dto;

/**
 * Yaade 嵌入态项目选择器使用的项目上下文。
 * 只暴露当前用户可见项目，以及它在 Yaade 中对应的根 collection 与 group 信息。
 */
public record YaadeProjectContextSummary(
        Long projectId,
        String projectName,
        Long yaadeCollectionId,
        String yaadeGroupName
) {
}
