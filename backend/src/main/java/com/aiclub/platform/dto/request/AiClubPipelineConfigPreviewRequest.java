package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

public record AiClubPipelineConfigPreviewRequest(
        @NotBlank(message = "模板编码不能为空")
        String templateCode,
        Map<String, String> parameters,
        boolean manualEdit,
        String content
) {
}
