package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssistantAndHindsightPropertiesTests {

    @Mock
    private PlatformEnvVarResolver platformEnvVarResolver;

    @Test
    void shouldReadAssistantBaseUrlAndApiKeyFromDeploymentConfigOnly() {
        AssistantProperties properties = new AssistantProperties(
                "http://runtime-hermes:18080/v1",
                "runtime-hermes-key",
                "hermes-agent",
                "180",
                "ai-club:hermes",
                6,
                86400,
                platformEnvVarResolver
        );

        assertThat(properties.getBaseUrl()).isEqualTo("http://runtime-hermes:18080/v1");
        assertThat(properties.getApiKey()).isEqualTo("runtime-hermes-key");
        verifyNoInteractions(platformEnvVarResolver);
    }

    @Test
    void shouldKeepAssistantModelAndTimeoutAsRuntimeManagedFields() {
        when(platformEnvVarResolver.resolveOrDefault(eq(PlatformEnvVarRegistry.KEY_HERMES_MODEL), any(), eq("hermes-agent")))
                .thenReturn("hermes-agent-gray");
        when(platformEnvVarResolver.resolveOrDefault(eq(PlatformEnvVarRegistry.KEY_HERMES_TIMEOUT_SECONDS), any(), eq("180")))
                .thenReturn("240");

        AssistantProperties properties = new AssistantProperties(
                "http://runtime-hermes:18080/v1",
                "runtime-hermes-key",
                "hermes-agent",
                "180",
                "ai-club:hermes",
                6,
                86400,
                platformEnvVarResolver
        );

        assertThat(properties.getModel()).isEqualTo("hermes-agent-gray");
        assertThat(properties.getTimeoutSeconds()).isEqualTo(240);
    }

    @Test
    void shouldReadHindsightBaseUrlAndApiKeyFromDeploymentConfigOnly() {
        HindsightProperties properties = new HindsightProperties(
                "http://runtime-hindsight:18888",
                "runtime-hindsight-key",
                "git-ai-club",
                "mid",
                "30",
                "",
                "",
                "/v1/default/banks/{bankId}/graph",
                "/v1/default/banks/{bankId}/entities/{entityId}",
                "/v1/default/banks/{bankId}/memories/recall",
                true,
                "jdbc:postgresql://localhost:5432/hindsight",
                "aiclub",
                "aiclub123",
                platformEnvVarResolver
        );

        assertThat(properties.getBaseUrl()).isEqualTo("http://runtime-hindsight:18888");
        assertThat(properties.getApiKey()).isEqualTo("runtime-hindsight-key");
        verifyNoInteractions(platformEnvVarResolver);
    }

    @Test
    void shouldKeepHindsightBudgetFieldsAsRuntimeManagedFields() {
        when(platformEnvVarResolver.resolveOrDefault(eq(PlatformEnvVarRegistry.KEY_HERMES_HINDSIGHT_BANK_ID), any(), eq("git-ai-club")))
                .thenReturn("runtime-bank-prefix");
        when(platformEnvVarResolver.resolveOrDefault(eq(PlatformEnvVarRegistry.KEY_HERMES_HINDSIGHT_BUDGET), any(), eq("mid")))
                .thenReturn("high");
        when(platformEnvVarResolver.resolveOrDefault(eq(PlatformEnvVarRegistry.KEY_HINDSIGHT_TIMEOUT_SECONDS), any(), eq("30")))
                .thenReturn("45");

        HindsightProperties properties = new HindsightProperties(
                "http://runtime-hindsight:18888",
                "runtime-hindsight-key",
                "git-ai-club",
                "mid",
                "30",
                "",
                "",
                "/v1/default/banks/{bankId}/graph",
                "/v1/default/banks/{bankId}/entities/{entityId}",
                "/v1/default/banks/{bankId}/memories/recall",
                true,
                "jdbc:postgresql://localhost:5432/hindsight",
                "aiclub",
                "aiclub123",
                platformEnvVarResolver
        );

        assertThat(properties.getBankPrefix()).isEqualTo("runtime-bank-prefix");
        assertThat(properties.getRecallBudget()).isEqualTo("high");
        assertThat(properties.getTimeoutSeconds()).isEqualTo(45);
    }
}
