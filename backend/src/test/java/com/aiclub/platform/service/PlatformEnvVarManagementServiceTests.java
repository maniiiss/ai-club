package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformEnvVarConfigEntity;
import com.aiclub.platform.dto.PlatformEnvVarDetail;
import com.aiclub.platform.dto.request.PlatformEnvVarUpdateRequest;
import com.aiclub.platform.repository.PlatformEnvVarConfigRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.env.MockEnvironment;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlatformEnvVarManagementServiceTests {

    @Mock
    private PlatformEnvVarConfigRepository platformEnvVarConfigRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private HttpClient httpClient;

    @Mock
    private HttpResponse<String> httpResponse;

    private PlatformEnvVarManagementService platformEnvVarManagementService;

    @BeforeEach
    void setUp() {
        PlatformEnvVarResolver platformEnvVarResolver = new PlatformEnvVarResolver(
                platformEnvVarConfigRepository,
                new PlatformEnvVarRegistry(),
                tokenCipherService,
                new MockEnvironment(),
                new ObjectMapper(),
                httpClient
        );
        platformEnvVarManagementService = new PlatformEnvVarManagementService(
                platformEnvVarConfigRepository,
                new PlatformEnvVarRegistry(),
                platformEnvVarResolver,
                tokenCipherService
        );
    }

    @Test
    void shouldHideSensitiveStaticValueInDetailResponse() {
        PlatformEnvVarConfigEntity entity = new PlatformEnvVarConfigEntity();
        entity.setEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN);
        entity.setSourceType(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC);
        entity.setStaticValueCiphertext("cipher-token");
        entity.setUpdatedAt(LocalDateTime.of(2026, 5, 9, 10, 30, 0));

        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN))
                .thenReturn(Optional.of(entity));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-access-token");

        PlatformEnvVarDetail detail = platformEnvVarManagementService.getEnvVarDetail(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN
        );

        assertThat(detail.sourceType()).isEqualTo(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC);
        assertThat(detail.staticValue()).isEmpty();
        assertThat(detail.staticValueConfigured()).isTrue();
        assertThat(detail.resolvedValuePreview()).isEqualTo("******");
    }

    @Test
    void shouldKeepExistingSensitiveStaticValueWhenBlankValueSubmitted() {
        PlatformEnvVarConfigEntity existing = new PlatformEnvVarConfigEntity();
        existing.setEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN);
        existing.setSourceType(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC);
        existing.setStaticValueCiphertext("cipher-token");

        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN))
                .thenReturn(Optional.of(existing));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-access-token");
        when(platformEnvVarConfigRepository.save(any(PlatformEnvVarConfigEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlatformEnvVarDetail detail = platformEnvVarManagementService.updateEnvVar(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                new PlatformEnvVarUpdateRequest(PlatformEnvVarRegistry.SOURCE_TYPE_STATIC, "", null, null)
        );

        assertThat(detail.staticValueConfigured()).isTrue();
        ArgumentCaptor<PlatformEnvVarConfigEntity> entityCaptor = ArgumentCaptor.forClass(PlatformEnvVarConfigEntity.class);
        verify(platformEnvVarConfigRepository).save(entityCaptor.capture());
        assertThat(entityCaptor.getValue().getStaticValueCiphertext()).isEqualTo("cipher-token");
        verify(tokenCipherService, never()).encrypt(any());
    }

    @Test
    void shouldPersistHttpConfigAfterSuccessfulValidation() throws Exception {
        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID))
                .thenReturn(Optional.empty());
        when(tokenCipherService.encrypt("{\"Authorization\":\"Bearer test-token\"}"))
                .thenReturn("cipher-headers");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"value\":\"4856171\"}");
        when(platformEnvVarConfigRepository.save(any(PlatformEnvVarConfigEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        PlatformEnvVarDetail detail = platformEnvVarManagementService.updateEnvVar(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                new PlatformEnvVarUpdateRequest(
                        PlatformEnvVarRegistry.SOURCE_TYPE_HTTP,
                        null,
                        "https://vault.example.com/runtime/gitee-enterprise-id",
                        "{\"Authorization\":\"Bearer test-token\"}"
                )
        );

        assertThat(detail.sourceType()).isEqualTo(PlatformEnvVarRegistry.SOURCE_TYPE_HTTP);
        assertThat(detail.httpUrl()).isEqualTo("https://vault.example.com/runtime/gitee-enterprise-id");
        assertThat(detail.resolvedValuePreview()).isEqualTo("4856171");

        ArgumentCaptor<PlatformEnvVarConfigEntity> entityCaptor = ArgumentCaptor.forClass(PlatformEnvVarConfigEntity.class);
        verify(platformEnvVarConfigRepository).save(entityCaptor.capture());
        assertThat(entityCaptor.getValue().getHttpHeadersCiphertext()).isEqualTo("cipher-headers");
    }

    @Test
    void shouldRejectInvalidHttpResolvedValueForEnterpriseId() throws Exception {
        when(platformEnvVarConfigRepository.findByEnvKey(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID))
                .thenReturn(Optional.empty());
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(httpResponse);
        when(httpResponse.statusCode()).thenReturn(200);
        when(httpResponse.body()).thenReturn("{\"value\":\"invalid-enterprise-id\"}");

        assertThatThrownBy(() -> platformEnvVarManagementService.updateEnvVar(
                PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                new PlatformEnvVarUpdateRequest(
                        PlatformEnvVarRegistry.SOURCE_TYPE_HTTP,
                        null,
                        "https://vault.example.com/runtime/gitee-enterprise-id",
                        null
                )
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("企业ID");
    }

    @Test
    void shouldListPrReviewOaCredentialsAsManagedEnvVars() {
        when(platformEnvVarConfigRepository.findAll()).thenReturn(java.util.List.of());

        java.util.List<com.aiclub.platform.dto.PlatformEnvVarSummary> summaries = platformEnvVarManagementService.listEnvVars().stream()
                .filter(item -> PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_USER_ID.equals(item.envKey())
                        || PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_TOKEN.equals(item.envKey()))
                .toList();

        assertThat(summaries).extracting(com.aiclub.platform.dto.PlatformEnvVarSummary::envKey)
                .containsExactlyInAnyOrder(
                        PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_USER_ID,
                        PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_TOKEN
                );
        assertThat(summaries).filteredOn(item -> PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_TOKEN.equals(item.envKey()))
                .first()
                .extracting(com.aiclub.platform.dto.PlatformEnvVarSummary::sensitive)
                .isEqualTo(true);
    }
}
