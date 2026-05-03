package com.aiclub.platform.dto;

/**
 * GitNexus 候选关键符号摘要。
 */
public record GitlabCodeStructureCandidateSymbolSummary(
        String uid,
        String name,
        String filePath,
        Integer startLine,
        Integer endLine,
        String symbolKind
) {
}
