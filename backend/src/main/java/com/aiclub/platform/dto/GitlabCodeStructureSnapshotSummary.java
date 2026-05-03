package com.aiclub.platform.dto;

import java.util.List;

/**
 * 代码仓库管理页读取的仓库代码结构快照。
 */
public record GitlabCodeStructureSnapshotSummary(
        Long bindingId,
        Long projectId,
        String projectName,
        String repositoryName,
        String repositoryPath,
        String branchName,
        String commitSha,
        String status,
        boolean degraded,
        boolean truncated,
        String generatedAt,
        String refreshStartedAt,
        String refreshFinishedAt,
        String summaryMarkdown,
        String lastErrorMessage,
        List<GitlabCodeStructureOverviewCardSummary> overviewCards,
        List<GitlabCodeStructureCandidateSymbolSummary> candidateSymbols,
        List<GitlabCodeStructureProcessSummary> candidateProcesses,
        List<String> harnessHints,
        List<GitlabCodeStructureGraphNodeSummary> graphNodes,
        List<GitlabCodeStructureGraphEdgeSummary> graphEdges
) {
}
