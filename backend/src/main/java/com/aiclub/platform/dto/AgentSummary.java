package com.aiclub.platform.dto;

public record AgentSummary(
        Long id,
        String name,
        String type,
        String status,
        Boolean enabled,
        String accessType,
        String builtinCode,
        String capability,
        String description,
        Long aiModelConfigId,
        String aiModelConfigName,
        String systemPrompt,
        String userPromptTemplate,
        String endpointUrl,
        String runtimeType,
        String runtimeAgentRef,
        String runtimeSessionKeyTemplate,
        String httpMethod,
        String httpHeaders,
        String httpAuthType,
        Boolean httpAuthTokenConfigured,
        String httpRequestTemplate,
        String httpResponsePath,
        Integer timeoutSeconds,
        Long projectId,
        String projectName
) {
}
