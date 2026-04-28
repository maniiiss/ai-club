package com.aiclub.platform.dto;

import java.util.List;

public record GitlabProductBranchSyncRunResult(
        Long bindingId,
        String projectName,
        String sourceBranchName,
        int targetCount,
        int createdCount,
        int noChangeCount,
        int existingOpenMrCount,
        int failedCount,
        List<GitlabProductBranchSyncRunItem> items
) {
}
