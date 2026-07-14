package com.aiclub.platform.dto;

import java.time.LocalDateTime;
import java.util.List;

/** Runtime 管理页展示的场景默认绑定摘要。 */
public record RuntimeScenarioDefaultSummary(
        String scenarioCode,
        String scenarioName,
        String runtimeRegistryCode,
        List<String> requiredCapabilities,
        LocalDateTime updatedAt
) {
    public RuntimeScenarioDefaultSummary {
        requiredCapabilities = requiredCapabilities == null ? List.of() : List.copyOf(requiredCapabilities);
    }
}
