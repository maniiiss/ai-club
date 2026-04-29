package com.aiclub.platform.dto;

public record GiteeMilestoneSummary(
        Long id,
        String title,
        String state,
        String startDate,
        String endDate
) {
}
