package com.aiclub.platform.dto;

import java.util.List;

public record CodeReviewResult(
        boolean approved,
        String summary,
        String provider,
        List<String> issues,
        String reviewMarkdown,
        List<String> resolvedPreviousIssues,
        List<String> unresolvedPreviousIssues
) {
}
