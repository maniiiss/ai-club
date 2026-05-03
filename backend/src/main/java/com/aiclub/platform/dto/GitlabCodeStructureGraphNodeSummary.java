package com.aiclub.platform.dto;

/**
 * 仓库代码结构图谱节点。
 */
public record GitlabCodeStructureGraphNodeSummary(
        String id,
        String nodeType,
        String label,
        String secondaryLabel,
        String detailText,
        String filePath,
        String symbolUid,
        Integer startLine,
        Integer endLine,
        String metadataJson
) {
}
