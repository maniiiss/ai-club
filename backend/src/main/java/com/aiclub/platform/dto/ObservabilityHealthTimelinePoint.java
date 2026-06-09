package com.aiclub.platform.dto;

/**
 * 健康趋势点。
 */
public record ObservabilityHealthTimelinePoint(
        String sampledAt,
        Integer healthScore,
        String healthLevel
) {
}
