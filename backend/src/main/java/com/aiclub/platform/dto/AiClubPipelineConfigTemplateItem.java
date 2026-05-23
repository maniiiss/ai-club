package com.aiclub.platform.dto;

import java.util.List;

public record AiClubPipelineConfigTemplateItem(
        String code,
        String name,
        String description,
        String category,
        String defaultConfigPath,
        String contentPreview,
        List<String> requirements,
        boolean readyToUse,
        boolean available,
        String unavailableReason,
        boolean requiresRegistry,
        String imageRepoPreview,
        List<AiClubPipelineConfigTemplateParameterItem> parameters
) {
}
