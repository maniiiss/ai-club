package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformEnvVarConfigEntity;
import com.aiclub.platform.repository.PlatformEnvVarConfigRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * 统一解析系统级环境变量的当前生效值。
 * 优先读取后台运行时覆盖配置，其次回退 Spring 配置，最后再回退业务内 legacy 兜底。
 */
@Service
public class PlatformEnvVarResolver {

    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(15);

    private final PlatformEnvVarConfigRepository platformEnvVarConfigRepository;
    private final PlatformEnvVarRegistry platformEnvVarRegistry;
    private final TokenCipherService tokenCipherService;
    private final Environment environment;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Autowired
    public PlatformEnvVarResolver(PlatformEnvVarConfigRepository platformEnvVarConfigRepository,
                                  PlatformEnvVarRegistry platformEnvVarRegistry,
                                  TokenCipherService tokenCipherService,
                                  Environment environment,
                                  ObjectMapper objectMapper) {
        this(
                platformEnvVarConfigRepository,
                platformEnvVarRegistry,
                tokenCipherService,
                environment,
                objectMapper,
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
        );
    }

    PlatformEnvVarResolver(PlatformEnvVarConfigRepository platformEnvVarConfigRepository,
                           PlatformEnvVarRegistry platformEnvVarRegistry,
                           TokenCipherService tokenCipherService,
                           Environment environment,
                           ObjectMapper objectMapper,
                           HttpClient httpClient) {
        this.platformEnvVarConfigRepository = platformEnvVarConfigRepository;
        this.platformEnvVarRegistry = platformEnvVarRegistry;
        this.tokenCipherService = tokenCipherService;
        this.environment = environment;
        this.objectMapper = objectMapper;
        this.httpClient = httpClient;
    }

    /**
     * 解析某个固定 Key 的当前生效值。
     */
    public PlatformEnvVarResolvedValue resolve(String envKey, Supplier<String> legacyFallbackSupplier) {
        PlatformEnvVarRegistry.PlatformEnvVarDefinition definition = platformEnvVarRegistry.requireDefinition(envKey);
        Optional<PlatformEnvVarConfigEntity> configured = platformEnvVarConfigRepository.findByEnvKey(definition.envKey());
        if (configured.isPresent()) {
            return resolveConfigured(definition, configured.get());
        }

        String springValue = normalizeSpringValue(definition, environment.getProperty(definition.propertyKey()));
        if (springValue != null) {
            return new PlatformEnvVarResolvedValue(
                    definition.envKey(),
                    definition.validateValue(springValue),
                    PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_SPRING
            );
        }

        String legacyValue = legacyFallbackSupplier == null ? null : trimToNull(legacyFallbackSupplier.get());
        if (legacyValue != null) {
            return new PlatformEnvVarResolvedValue(
                    definition.envKey(),
                    definition.validateValue(legacyValue),
                    PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_LEGACY
            );
        }

        throw new IllegalStateException(definition.displayName() + "未配置");
    }

    /**
     * 解析允许为空的环境变量，常用于 API Key 这类本地开发可留空、生产环境再补齐的集成参数。
     */
    public String resolveOptional(String envKey, Supplier<String> legacyFallbackSupplier) {
        try {
            return resolve(envKey, legacyFallbackSupplier).value();
        } catch (IllegalStateException exception) {
            return "";
        }
    }

    /**
     * 解析带业务默认值的环境变量，后台未配置且 Spring 配置为空时返回调用方显式默认值。
     */
    public String resolveOrDefault(String envKey, Supplier<String> legacyFallbackSupplier, String defaultValue) {
        try {
            return resolve(envKey, legacyFallbackSupplier).value();
        } catch (IllegalStateException exception) {
            return defaultString(defaultValue, "");
        }
    }

    /**
     * 解析一条待保存或已保存配置本身的实际值。
     * 管理后台保存时会调用这里做即时校验，避免脏配置进入运行时。
     */
    public PlatformEnvVarResolvedValue resolveConfigured(PlatformEnvVarConfigEntity configEntity) {
        PlatformEnvVarRegistry.PlatformEnvVarDefinition definition = platformEnvVarRegistry.requireDefinition(configEntity.getEnvKey());
        return resolveConfigured(definition, configEntity);
    }

    private PlatformEnvVarResolvedValue resolveConfigured(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                                          PlatformEnvVarConfigEntity configEntity) {
        String sourceType = platformEnvVarRegistry.normalizeSourceType(configEntity.getSourceType());
        if (PlatformEnvVarRegistry.SOURCE_TYPE_STATIC.equals(sourceType)) {
            String ciphertext = trimToNull(configEntity.getStaticValueCiphertext());
            if (ciphertext == null) {
                throw new IllegalStateException(definition.displayName() + "缺少固定值");
            }
            return new PlatformEnvVarResolvedValue(
                    definition.envKey(),
                    definition.validateValue(tokenCipherService.decrypt(ciphertext)),
                    PlatformEnvVarRegistry.SOURCE_TYPE_STATIC
            );
        }
        if (PlatformEnvVarRegistry.SOURCE_TYPE_HTTP.equals(sourceType)) {
            return new PlatformEnvVarResolvedValue(
                    definition.envKey(),
                    definition.validateValue(fetchHttpValue(definition, configEntity)),
                    PlatformEnvVarRegistry.SOURCE_TYPE_HTTP
            );
        }
        throw new IllegalStateException("不支持的来源类型: " + sourceType);
    }

    private String fetchHttpValue(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition,
                                  PlatformEnvVarConfigEntity configEntity) {
        String httpUrl = trimToNull(configEntity.getHttpUrl());
        if (httpUrl == null) {
            throw new IllegalStateException(definition.displayName() + "缺少 HTTP 地址");
        }
        try {
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(httpUrl))
                    .timeout(REQUEST_TIMEOUT)
                    .GET();
            parseHeadersJson(decryptHeaders(configEntity.getHttpHeadersCiphertext()))
                    .forEach(requestBuilder::header);
            HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("通过 HTTP 获取" + definition.displayName() + "失败，返回状态: " + response.statusCode());
            }
            JsonNode root = objectMapper.readTree(defaultString(response.body(), "{}"));
            JsonNode valueNode = root.path("value");
            if (valueNode.isMissingNode() || valueNode.isNull()) {
                throw new IllegalStateException("通过 HTTP 获取" + definition.displayName() + "失败，响应缺少顶层 value 字段");
            }
            String resolved = trimToNull(valueNode.asText());
            if (resolved == null) {
                throw new IllegalStateException("通过 HTTP 获取" + definition.displayName() + "失败，value 字段为空");
            }
            return resolved;
        } catch (IOException exception) {
            throw new IllegalStateException("通过 HTTP 获取" + definition.displayName() + "失败，响应解析异常", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("通过 HTTP 获取" + definition.displayName() + "失败，请求被中断", exception);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw exception;
        }
    }

    Map<String, String> parseHeadersJson(String headersJson) {
        String normalized = trimToNull(headersJson);
        if (normalized == null) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(normalized);
            if (!root.isObject()) {
                throw new IllegalArgumentException("HTTP 请求头必须是 JSON 对象");
            }
            Map<String, String> headers = new LinkedHashMap<>();
            Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String headerName = trimToNull(entry.getKey());
                if (headerName == null) {
                    throw new IllegalArgumentException("HTTP 请求头名称不能为空");
                }
                String headerValue = trimToNull(entry.getValue().isNull() ? null : entry.getValue().asText());
                if (headerValue == null) {
                    throw new IllegalArgumentException("HTTP 请求头 " + headerName + " 的值不能为空");
                }
                headers.put(headerName, headerValue);
            }
            return headers;
        } catch (IOException exception) {
            throw new IllegalArgumentException("HTTP 请求头 JSON 格式不正确", exception);
        }
    }

    private String decryptHeaders(String ciphertext) {
        String normalized = trimToNull(ciphertext);
        if (normalized == null) {
            return null;
        }
        return tokenCipherService.decrypt(normalized);
    }

    private String normalizeSpringValue(PlatformEnvVarRegistry.PlatformEnvVarDefinition definition, String rawValue) {
        String normalized = trimToNull(rawValue);
        if (normalized == null) {
            return null;
        }
        if (isPrReviewOaCredential(definition.envKey())) {
            return null;
        }
        if (PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID.equals(definition.envKey()) && "0".equals(normalized)) {
            return null;
        }
        return normalized;
    }

    private boolean isPrReviewOaCredential(String envKey) {
        return PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_USER_ID.equals(envKey)
                || PlatformEnvVarRegistry.KEY_PR_REVIEW_OA_TOKEN.equals(envKey);
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private String defaultString(String value, String fallback) {
        return value == null ? fallback : value;
    }

    public record PlatformEnvVarResolvedValue(String envKey, String value, String effectiveSourceType) {
    }
}
