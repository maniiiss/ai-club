package com.aiclub.platform.dto;

import java.util.List;

/**
 * 仓库代码结构页的临时查询结果。
 * 查询结果只用于当前页面展示，不会写入仓库快照表。
 */
public record GitlabCodeStructureQueryResult(
        String branchName,
        String commitSha,
        boolean degraded,
        boolean truncated,
        String lastErrorMessage,
        List<GitlabCodeStructureCandidateSymbolSummary> hitSymbols,
        List<GitlabCodeStructureProcessSummary> hitProcesses,
        List<GitlabCodeStructureGraphNodeSummary> graphNodes,
        List<GitlabCodeStructureGraphEdgeSummary> graphEdges
) {
}
