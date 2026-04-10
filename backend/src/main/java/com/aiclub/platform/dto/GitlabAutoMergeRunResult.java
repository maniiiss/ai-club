package com.aiclub.platform.dto;

import java.util.List;

public record GitlabAutoMergeRunResult(
        Long configId,
        String configName,
        int matchedCount,
        int mergedCount,
        int skippedCount,
        List<GitlabAutoMergeRunItem> items
) {
}
