package com.aiclub.platform.dto;

import java.util.List;

public record TestPlanSummary(
        Long id,
        String name,
        String status,
        String description,
        Long projectId,
        String projectName,
        Long iterationId,
        String iterationName,
        Integer caseCount,
        String createdAt,
        String updatedAt,
        List<TestCaseSummary> cases
) {
}
