package com.aiclub.platform.dto;

import java.util.List;

public record AiClubPipelineConfigTemplateParameterItem(
        String key,
        String label,
        String type,
        boolean required,
        String defaultValue,
        String placeholder,
        String helpText,
        List<String> options,
        boolean secret,
        String dependsOnKey,
        String dependsOnValue
) {
}
