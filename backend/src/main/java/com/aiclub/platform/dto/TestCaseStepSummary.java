package com.aiclub.platform.dto;

public record TestCaseStepSummary(
        Long id,
        Integer stepNo,
        String action,
        String expectedResult
) {
}
