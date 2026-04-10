package com.aiclub.platform.dto;

import java.util.List;

public record ProjectBurndownSummary(
        String startDate,
        String endDate,
        Integer totalWorkItemCount,
        Integer completedWorkItemCount,
        Integer remainingWorkItemCount,
        List<String> labels,
        List<Integer> idealRemaining,
        List<Integer> actualRemaining
) {
}
