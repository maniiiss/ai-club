package com.aiclub.platform.dto;

public record GitlabProductBranchSyncRunItem(
        Long productBranchId,
        String lineCode,
        String lineName,
        String targetBranchName,
        String result,
        String message,
        Integer behindCount,
        Long mergeRequestIid,
        String mergeRequestWebUrl
) {
}
