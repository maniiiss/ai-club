package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformEnvVarConfigEntity;
import com.aiclub.platform.dto.PlatformEnvVarDetail;
import com.aiclub.platform.dto.PlatformEnvVarSummary;
import com.aiclub.platform.dto.request.PlatformEnvVarUpdateRequest;
import com.aiclub.platform.repository.PlatformEnvVarConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 系统级环境变量管理服务。
 * 固定注册表定义可管理项，数据库只保存来源配置和敏感值密文，不保存任意自定义 Key。
 */
@Service
@Transactional(readOnly = true)
public class PlatformEnvVarManagementService {

    static final String STATUS_ACTIVE = "ACTIVE";
    static final String STATUS_ERROR = "ERROR";
    static final String STATUS_MISSING = "MISSING";

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final PlatformEnvVarConfigRepository platformEnvVarConfigRepository;
    private final PlatformEnvVarRegistry platformEnvVarRegistry;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final TokenCipherService tokenCipherService;

    public PlatformEnvVarManagementService(PlatformEnvVarConfigRepository platformEnvVarConfigRepository,
                                           PlatformEnvVarRegistry platformEnvVarRegistry,
                                           PlatformEnvVarResolver platformEnvVarResolver,
                                           TokenCipherService tokenCipherService) {
        this.platformEnvVarConfigRepository = platformEnvVarConfigRepository;
        this.platformEnvVarRegistry = platformEnvVarRegistry;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.tokenCipherService = tokenCipherService;
    }

    public List<PlatformEnvVarSummary> listEnvVars() {
        Map<String, PlatformEnvVarConfigEntity> configuredByKey = new LinkedHashMap<>();
        platformEnvVarConfigRepository.findAll().forEach(item -> configuredByKey.put(item.getEnvKey(), item));
        return platformEnvVarRegistry.listDefinitions().stream()
                .map(definition -> toSummary(definition, configuredByKey.get(definition.envKey())))
                .toList();
    }

    public PlatformEnvVarDetail getEnvVarDetail(String envKey) {
        PlatformEnvVarRegistry.PlatformEnvVarDefinition definition = platformEnvVarRegistry.requireDefinition(envKey);
        PlatformEnvVarConfigEntity entity = platformEnvVarConfigRepository.findByEnvKey(definition.envKey()).orElse(null);
        ResolutionView resolutionView = resolveForView(definition, entity);
        return new PlatformEnvVarDetail(
                definition.envKey(),
                definition.displayName(),
                definition.description(),
                definition.sensitive(),
                entity == null ? null : platformEnvVarRegistry.normalizeSourceType(entity.getSourceType()),
                resolutionView.effectiveSourceType(),
                resolutionView.configured(),
                resolutionView.status(),
                resolutionView.statusMessage(),
                formatTime(entity == null ? null : entity.getUpdatedAt()),
                resolveStaticValueForDetail(definition, entity),
                hasStaticValue(entity),
                entity == null ? "" : defaultString(entity.getHttpUrl()),
                resolveHttpHeadersForDetail(entity),
                hasHttpHeaders(entity),
                resolutionView.resolvedValuePreview()
        );
    }

    @Transactional
    public PlatformEnvVarDetail updateEnvVar(String envKey, PlatformEnvVarUpdateRequest request) {
        PlatformEnvVarRegistry.PlatformEnvVarDefinition definition = platformEnvVarRegistry.requireDefinition(envKey);
        PlatformEnvVarConfigEntity existing = platformEnvVarConfigRepository.findByEnvKey(definition.envKey()).orElse(null);
        PlatformEnvVarConfigEntity entity = existing == null ? new PlatformEnvVarConfigEntity() : existing;
        entity.setEnvKey(definition.envKey());

        String sourceType = platformEnvVarRegistry.normalizeSourceType(request.sourceType());
        entity.setSourceType(sourceType);
        if (PlatformEnvVarRegistry.SOURCE_TYPE_STATIC.equals(sourceType)) {
            String staticValue = resolveStaticValueForSave(definition, existing, request.staticValue());
            if (existing != null
                    && hasText(existing.getStaticValueCiphertext())
                    && definition.sensitive()
                    && !hasText(request.staticValue())
                    && PlatformEnvVarRegistry.SOURCE_TYPE_STATIC.equalsIgnoreCase(existing.getSourceType())) {
                entity.setStaticValueCiphertext(existing.getStaticValueCiphertext());
            } else {
                entity.setStaticValueCiphertext(tokenCipherService.encrypt(staticValue));
            }
            entity.setHttpUrl(null);
            entity.setHttpHeadersCiphertext(null);
        } else {
            String headersJson = resolveHttpHeadersJsonForSave(existing, request.httpHeadersJson());
            entity.setStaticValueCiphertext(null);
            entity.setHttpUrl(requireText(request.httpUrl(), definition.displayName() + "的 HTTP 地址不能为空"));
            entity.setHttpHeadersCiphertext(headersJson == null ? null : tokenCipherService.encrypt(headersJson));
        }

        // 保存前先用待生效配置做即时校验，避免异常配置进入运行时。
        platformEnvVarResolver.resolveConfigured(entity);
        PlatformEnvVarConfigEntity saved = platformEnvVarConfigRepository.save(entity);
        return toDetail(definition, saved);
    }

    private PlatformEnvVarSummary toSummary(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                            PlatformEnvVarConfigEntity entity) {
        ResolutionView resolutionView = resolveForView(definition, entity);
        return new PlatformEnvVarSummary(
                definition.envKey(),
                definition.displayName(),
                definition.description(),
                definition.sensitive(),
                entity == null ? null : platformEnvVarRegistry.normalizeSourceType(entity.getSourceType()),
                resolutionView.effectiveSourceType(),
                resolutionView.configured(),
                resolutionView.status(),
                resolutionView.statusMessage(),
                formatTime(entity == null ? null : entity.getUpdatedAt())
        );
    }

    private PlatformEnvVarDetail toDetail(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                          PlatformEnvVarConfigEntity entity) {
        ResolutionView resolutionView = resolveForView(definition, entity);
        return new PlatformEnvVarDetail(
                definition.envKey(),
                definition.displayName(),
                definition.description(),
                definition.sensitive(),
                entity == null ? null : platformEnvVarRegistry.normalizeSourceType(entity.getSourceType()),
                resolutionView.effectiveSourceType(),
                resolutionView.configured(),
                resolutionView.status(),
                resolutionView.statusMessage(),
                formatTime(entity == null ? null : entity.getUpdatedAt()),
                resolveStaticValueForDetail(definition, entity),
                hasStaticValue(entity),
                entity == null ? "" : defaultString(entity.getHttpUrl()),
                resolveHttpHeadersForDetail(entity),
                hasHttpHeaders(entity),
                resolutionView.resolvedValuePreview()
        );
    }

    private ResolutionView resolveForView(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                          PlatformEnvVarConfigEntity entity) {
        try {
            PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolvedValue = entity == null
                    ? platformEnvVarResolver.resolve(definition.envKey(), () -> null)
                    : platformEnvVarResolver.resolveConfigured(entity);
            return new ResolutionView(
                    true,
                    resolvedValue.effectiveSourceType(),
                    STATUS_ACTIVE,
                    "已生效",
                    definition.previewValue(resolvedValue.value())
            );
        } catch (RuntimeException exception) {
            if (entity == null) {
                return new ResolutionView(false, PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_NONE, STATUS_MISSING, "未配置", "");
            }
            return new ResolutionView(
                    false,
                    platformEnvVarRegistry.normalizeSourceType(entity.getSourceType()),
                    STATUS_ERROR,
                    defaultString(exception.getMessage()),
                    ""
            );
        }
    }

    private String resolveStaticValueForDetail(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                               PlatformEnvVarConfigEntity entity) {
        if (entity == null || !PlatformEnvVarRegistry.SOURCE_TYPE_STATIC.equalsIgnoreCase(entity.getSourceType()) || !hasText(entity.getStaticValueCiphertext())) {
            return "";
        }
        if (definition.sensitive()) {
            return "";
        }
        return tokenCipherService.decrypt(entity.getStaticValueCiphertext());
    }

    private String resolveHttpHeadersForDetail(PlatformEnvVarConfigEntity entity) {
        if (!hasHttpHeaders(entity)) {
            return "";
        }
        // 请求头可能承载密钥，因此详情页仅返回空字符串并配合 configured 状态提示用户“留空保留旧值”。
        return "";
    }

    private String resolveStaticValueForSave(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                             PlatformEnvVarConfigEntity existing,
                                             String requestedValue) {
        String normalizedRequestedValue = trimToNull(requestedValue);
        if (normalizedRequestedValue != null) {
            return definition.validateValue(normalizedRequestedValue);
        }
        if (existing != null
                && PlatformEnvVarRegistry.SOURCE_TYPE_STATIC.equalsIgnoreCase(existing.getSourceType())
                && hasText(existing.getStaticValueCiphertext())) {
            return definition.validateValue(tokenCipherService.decrypt(existing.getStaticValueCiphertext()));
        }
        return definition.validateValue(normalizedRequestedValue);
    }

    private String resolveHttpHeadersJsonForSave(PlatformEnvVarConfigEntity existing, String requestedHeadersJson) {
        String normalizedRequestedHeadersJson = trimToNull(requestedHeadersJson);
        if (normalizedRequestedHeadersJson != null) {
            Map<String, String> headers = platformEnvVarResolver.parseHeadersJson(normalizedRequestedHeadersJson);
            return headers.isEmpty() ? null : normalizedRequestedHeadersJson;
        }
        if (existing != null
                && PlatformEnvVarRegistry.SOURCE_TYPE_HTTP.equalsIgnoreCase(existing.getSourceType())
                && hasText(existing.getHttpHeadersCiphertext())) {
            return tokenCipherService.decrypt(existing.getHttpHeadersCiphertext());
        }
        return null;
    }

    private boolean hasStaticValue(PlatformEnvVarConfigEntity entity) {
        return entity != null && hasText(entity.getStaticValueCiphertext());
    }

    private boolean hasHttpHeaders(PlatformEnvVarConfigEntity entity) {
        return entity != null && hasText(entity.getHttpHeadersCiphertext());
    }

    private String requireText(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private record ResolutionView(boolean configured,
                                  String effectiveSourceType,
                                  String status,
                                  String statusMessage,
                                  String resolvedValuePreview) {
    }
}
