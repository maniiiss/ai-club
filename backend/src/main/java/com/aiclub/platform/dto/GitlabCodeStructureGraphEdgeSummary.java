package com.aiclub.platform.dto;

/**
 * 仓库代码结构图谱边。
 */
public record GitlabCodeStructureGraphEdgeSummary(
        String id,
        String sourceId,
        String targetId,
        String edgeType,
        String detailText
) {
}
