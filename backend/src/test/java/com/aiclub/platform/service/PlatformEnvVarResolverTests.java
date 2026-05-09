package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformEnvVarConfigEntity;
import com.aiclub.platform.repository.PlatformEnvVarConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.env.MockEnvironment;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlatformEnvVarResolverTests {

    @Mock
    private PlatformEnvVarConfigRepository platformEnvVarConfigRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private PlatformEnvVarResolver platformEnvVarResolver;

    private MockEnvironment environment;

    @BeforeEach
    void setUp() {
        environment = new MockEnvironment();
        platformEnvVarResolver = new PlatformEnvVarResolver(
                platformEnvVarConfigRepository,
                new PlatformEnvVarRegistry(),
                tokenCipherService,
                environment,
                new ObjectMapper(),
                httpClient
        );
    }

    @Test
    void shouldResolveRuntimeStaticValueBeforeSpringAndLegacyFallback() {
        PlatformEnvVarConfigEntity entity = new PlatformEnvVarConfigEntity();
        entity.setEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID);
        entity.setSourceType(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC);
        entity.setStaticValueCiphertext("cipher-enterprise-id");

        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID))
                .thenReturn(Optional.of(entity));
        when(tokenCipherService.decrypt("cipher-enterprise-id")).thenReturn("13579");
        environment.setProperty("platform.gitee.binding.enterprise-id", "24680");

        PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolvedValue = platformEnvVarResolver.resolve(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                () -> "9988"
        );

        assertThat(resolvedValue.value()).isEqualTo("13579");
        assertThat(resolvedValue.effectiveSourceType()).isEqualTo(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC);
    }

    @Test
    void shouldResolveHttpValueFromJsonField() throws Exception {
        PlatformEnvVarConfigEntity entity = new PlatformEnvVarConfigEntity();
        entity.setEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN);
        entity.setSourceType(PlatformEnvVarRegistry.SOURCE_TYPE_HTTP);
        entity.setHttpUrl("https://vault.example.com/runtime/gitee-token");
        entity.setHttpHeadersCiphertext("cipher-headers");

        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN))
                .thenReturn(Optional.of(entity));
        when(tokenCipherService.decrypt("cipher-headers"))
                .thenReturn("{\"Authorization\":\"Bearer runtime-token\",\"X-Tenant\":\"ai-club\"}");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"value\":\"http-access-token\"}");

        PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolvedValue = platformEnvVarResolver.resolve(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                () -> "legacy-token"
        );

        assertThat(resolvedValue.value()).isEqualTo("http-access-token");
        assertThat(resolvedValue.effectiveSourceType()).isEqualTo(PlatformEnvVarRegistry.SOURCE_TYPE_HTTP);

        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(httpClient).send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class));
        HttpRequest request = requestCaptor.getValue();
        assertThat(request.method()).isEqualTo("GET");
        assertThat(request.uri()).isEqualTo(URI.create("https://vault.example.com/runtime/gitee-token"));
        assertThat(request.headers().firstValue("Authorization")).contains("Bearer runtime-token");
        assertThat(request.headers().firstValue("X-Tenant")).contains("ai-club");
    }

    @Test
    void shouldFallBackToSpringValueWhenNoRuntimeOverrideExists() {
        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN))
                .thenReturn(Optional.empty());
        environment.setProperty("platform.gitee.binding.access-token", "spring-fallback-token");

        PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolvedValue = platformEnvVarResolver.resolve(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                () -> "legacy-token"
        );

        assertThat(resolvedValue.value()).isEqualTo("spring-fallback-token");
        assertThat(resolvedValue.effectiveSourceType()).isEqualTo(PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_SPRING);
    }

    @Test
    void shouldFallBackToLegacyValueWhenRuntimeAndSpringValuesAreMissing() {
        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID))
                .thenReturn(Optional.empty());

        PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolvedValue = platformEnvVarResolver.resolve(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                () -> "4856171"
        );

        assertThat(resolvedValue.value()).isEqualTo("4856171");
        assertThat(resolvedValue.effectiveSourceType()).isEqualTo(PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_LEGACY);
    }

    @Test
    void shouldRejectHttpResponseWithoutTopLevelValueField() throws Exception {
        PlatformEnvVarConfigEntity entity = new PlatformEnvVarConfigEntity();
        entity.setEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID);
        entity.setSourceType(PlatformEnvVarRegistry.SOURCE_TYPE_HTTP);
        entity.setHttpUrl("https://vault.example.com/runtime/gitee-enterprise-id");

        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID))
                .thenReturn(Optional.of(entity));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"tenantId\":\"4856171\"}");

        assertThatThrownBy(() -> platformEnvVarResolver.resolve(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                () -> "9988"
        )).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("value");
    }
}
