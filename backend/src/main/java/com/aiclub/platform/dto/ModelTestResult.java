package com.aiclub.platform.dto;

public record ModelTestResult(
        Long id,
        String name,
        String provider,
        String modelName,
        Boolean success,
        String message,
        String testedAt
) {
}
