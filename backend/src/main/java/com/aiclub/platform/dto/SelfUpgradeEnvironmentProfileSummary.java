package com.aiclub.platform.dto;

public record SelfUpgradeEnvironmentProfileSummary(
        Long id,
        String code,
        String name,
        String baseUrl,
        String allowedHostPatternsJson,
        String loginScriptJson,
        String sandboxUsername,
        boolean sandboxPasswordConfigured,
        boolean sessionStateConfigured,
        String writeAllowlistJson,
        boolean enabled
) {
}
