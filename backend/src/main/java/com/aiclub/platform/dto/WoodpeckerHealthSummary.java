package com.aiclub.platform.dto;

public record WoodpeckerHealthSummary(
        boolean enabled,
        boolean configured,
        boolean available,
        String internalBaseUrl,
        String publicBaseUrl,
        String message,
        String checkedAt,
        String userName
) {
}
