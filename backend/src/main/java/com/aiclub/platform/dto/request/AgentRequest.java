package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AgentRequest(
        @NotBlank(message = "Agent name is required")
        @Size(max = 100, message = "Agent name must be at most 100 characters")
        String name,
        @NotBlank(message = "Agent type is required")
        @Size(max = 50, message = "Agent type must be at most 50 characters")
        String type,
        @NotBlank(message = "Agent status is required")
        @Size(max = 30, message = "Agent status must be at most 30 characters")
        String status,
        Boolean enabled,
        @NotBlank(message = "Agent access type is required")
        @Size(max = 20, message = "Agent access type must be at most 20 characters")
        String accessType,
        @Size(max = 50, message = "Built-in agent code must be at most 50 characters")
        String builtinCode,
        @Size(max = 500, message = "Capability must be at most 500 characters")
        String capability,
        @Size(max = 5000, message = "Description must be at most 5000 characters")
        String description,
        Long aiModelConfigId,
        @Size(max = 10000, message = "System prompt must be at most 10000 characters")
        String systemPrompt,
        @Size(max = 10000, message = "User prompt template must be at most 10000 characters")
        String userPromptTemplate,
        @Size(max = 500, message = "Endpoint URL must be at most 500 characters")
        String endpointUrl,
        @Size(max = 30, message = "Runtime type must be at most 30 characters")
        String runtimeType,
        @Size(max = 100, message = "Runtime agent reference must be at most 100 characters")
        String runtimeAgentRef,
        @Size(max = 500, message = "Runtime session key template must be at most 500 characters")
        String runtimeSessionKeyTemplate,
        @Size(max = 10, message = "HTTP method must be at most 10 characters")
        String httpMethod,
        @Size(max = 10000, message = "HTTP headers must be at most 10000 characters")
        String httpHeaders,
        @Size(max = 20, message = "HTTP auth type must be at most 20 characters")
        String httpAuthType,
        @Size(max = 2000, message = "HTTP auth token must be at most 2000 characters")
        String httpAuthToken,
        @Size(max = 20000, message = "HTTP request template must be at most 20000 characters")
        String httpRequestTemplate,
        @Size(max = 255, message = "HTTP response path must be at most 255 characters")
        String httpResponsePath,
        Integer timeoutSeconds,
        Long projectId
) {
}
