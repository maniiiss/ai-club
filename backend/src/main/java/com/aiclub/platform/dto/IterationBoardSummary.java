package com.aiclub.platform.dto;

import java.util.List;

public record IterationBoardSummary(
        ProjectSummary project,
        Integer unplannedCount,
        Integer totalWorkItemCount,
        List<IterationSummary> iterations
) {
}
