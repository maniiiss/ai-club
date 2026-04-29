package com.aiclub.platform.dto;

import java.util.List;

public record GiteeProjectBindingDiscoveryResult(
        Long enterpriseId,
        String apiBaseUrl,
        String message,
        List<GiteeProgramSummary> programs
) {
}
