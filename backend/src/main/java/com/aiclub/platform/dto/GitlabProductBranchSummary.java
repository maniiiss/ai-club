package com.aiclub.platform.dto;

public record GitlabProductBranchSummary(
        Long id,
        Long bindingId,
        String lineCode,
        String lineName,
        String branchName,
        Boolean enabled,
        Integer behindCount,
        Boolean hasDiffWithMainline,
        Boolean hasOpenSyncMr,
        Long openSyncMergeRequestIid,
        String openSyncMergeRequestTitle,
        String openSyncMergeRequestWebUrl,
        String lastSyncStatus,
        String lastSyncMessage,
        String lastSyncAt,
        String lastSyncMrUrl
) {
}
