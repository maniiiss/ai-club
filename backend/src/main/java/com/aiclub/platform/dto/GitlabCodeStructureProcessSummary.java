package com.aiclub.platform.dto;

/**
 * GitNexus 识别出的候选流程摘要。
 */
public record GitlabCodeStructureProcessSummary(
        String id,
        String name,
        Integer stepIndex,
        Integer stepCount
) {
}
