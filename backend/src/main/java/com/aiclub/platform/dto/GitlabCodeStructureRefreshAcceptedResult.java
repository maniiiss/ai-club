package com.aiclub.platform.dto;

/**
 * 仓库代码结构刷新受理结果。
 */
public record GitlabCodeStructureRefreshAcceptedResult(
        Long bindingId,
        String branchName,
        String status,
        boolean accepted,
        String refreshStartedAt,
        String generatedAt,
        String lastErrorMessage
) {
}
