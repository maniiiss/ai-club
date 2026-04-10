package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.AiModelConfigSummary;
import com.aiclub.platform.dto.ModelTestResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AiModelConfigRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class ModelConfigService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Duration MODEL_REQUEST_TIMEOUT = Duration.ofSeconds(120);

    private final AiModelConfigRepository aiModelConfigRepository;
    private final TokenCipherService tokenCipherService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public ModelConfigService(AiModelConfigRepository aiModelConfigRepository,
                              TokenCipherService tokenCipherService,
                              ObjectMapper objectMapper) {
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.tokenCipherService = tokenCipherService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public PageResponse<AiModelConfigSummary> pageConfigs(int page, int size, String keyword, String provider, Boolean enabled) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.ASC, "id"));
        Page<AiModelConfigSummary> pageData = aiModelConfigRepository.findAll(buildSpecification(keyword, provider, enabled), pageable)
                .map(this::toSummary);
        return PageResponse.from(pageData);
    }

    public List<AiModelConfigSummary> listEnabledOptions() {
        return aiModelConfigRepository.findAllByEnabledTrueOrderByIdAsc().stream().map(this::toSummary).toList();
    }

    public AiModelConfigSummary getConfig(Long id) {
        return toSummary(requireConfig(id));
    }

    @Transactional
    public AiModelConfigSummary createConfig(AiModelConfigRequest request) {
        AiModelConfigEntity entity = new AiModelConfigEntity();
        fillEntity(entity, request, true);
        return toSummary(aiModelConfigRepository.save(entity));
    }

    @Transactional
    public AiModelConfigSummary updateConfig(Long id, AiModelConfigRequest request) {
        AiModelConfigEntity entity = requireConfig(id);
        fillEntity(entity, request, false);
        return toSummary(aiModelConfigRepository.save(entity));
    }

    @Transactional
    public void deleteConfig(Long id) {
        aiModelConfigRepository.delete(requireConfig(id));
    }

    public ModelTestResult testConfig(Long id) {
        ResolvedModelConfig config = resolveModelConfig(id);
        LocalDateTime testedAt = LocalDateTime.now();
        try {
            String content = invokeTestPrompt(config);
            String message = hasText(content)
                    ? "连接成功，模型已返回内容：" + abbreviate(content, 200)
                    : "连接成功，模型接口调用正常。";
            return new ModelTestResult(
                    config.id(),
                    config.name(),
                    config.provider(),
                    config.modelName(),
                    true,
                    message,
                    formatTime(testedAt)
            );
        } catch (RuntimeException exception) {
            return new ModelTestResult(
                    config.id(),
                    config.name(),
                    config.provider(),
                    config.modelName(),
                    false,
                    limitMessage(exception.getMessage()),
                    formatTime(testedAt)
            );
        }
    }

    public ResolvedModelConfig resolveModelConfig(Long id) {
        AiModelConfigEntity entity = requireConfig(id);
        return new ResolvedModelConfig(
                entity.getId(),
                entity.getName(),
                entity.getProvider(),
                entity.getApiBaseUrl(),
                entity.getModelName(),
                tokenCipherService.decrypt(entity.getApiKeyCiphertext())
        );
    }

    public String invokePrompt(Long id, String systemPrompt, String userPrompt) {
        return invokePrompt(resolveModelConfig(id), systemPrompt, userPrompt, 2048);
    }

    public String invokePrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, Integer maxTokens) {
        String provider = normalizeProvider(config.provider());
        int safeMaxTokens = maxTokens == null ? 2048 : Math.max(64, Math.min(maxTokens, 8192));
        try {
            if ("OPENAI".equals(provider)) {
                return invokeOpenAiPrompt(config, systemPrompt, userPrompt, safeMaxTokens);
            }
            if ("ANTHROPIC".equals(provider)) {
                return invokeAnthropicPrompt(config, systemPrompt, userPrompt, safeMaxTokens);
            }
            throw new IllegalArgumentException("仅支持 OPENAI 和 ANTHROPIC");
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("模型调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    private void fillEntity(AiModelConfigEntity entity, AiModelConfigRequest request, boolean createMode) {
        entity.setName(request.name().trim());
        entity.setProvider(normalizeProvider(request.provider()));
        entity.setApiBaseUrl(resolveApiBaseUrl(request.provider(), request.apiBaseUrl()));
        entity.setModelName(request.modelName().trim());
        entity.setDescription(request.description() == null ? "" : request.description().trim());
        entity.setEnabled(request.enabled() == null || request.enabled());

        if (createMode) {
            entity.setApiKeyCiphertext(tokenCipherService.encrypt(requireApiKey(request.apiKey())));
        } else if (hasText(request.apiKey())) {
            entity.setApiKeyCiphertext(tokenCipherService.encrypt(request.apiKey().trim()));
        } else if (!hasText(entity.getApiKeyCiphertext())) {
            throw new IllegalArgumentException("API Key 不能为空");
        }
    }

    private Specification<AiModelConfigEntity> buildSpecification(String keyword, String provider, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("modelName")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (hasText(provider)) {
                predicates.add(cb.equal(root.get("provider"), normalizeProvider(provider)));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private AiModelConfigSummary toSummary(AiModelConfigEntity entity) {
        return new AiModelConfigSummary(
                entity.getId(),
                entity.getName(),
                entity.getProvider(),
                entity.getApiBaseUrl(),
                entity.getModelName(),
                hasText(entity.getApiKeyCiphertext()),
                entity.getDescription(),
                entity.getEnabled()
        );
    }

    private String invokeTestPrompt(ResolvedModelConfig config) {
        String provider = normalizeProvider(config.provider());
        try {
            if ("OPENAI".equals(provider)) {
                return invokeOpenAi(config);
            }
            if ("ANTHROPIC".equals(provider)) {
                return invokeAnthropic(config);
            }
            throw new IllegalArgumentException("仅支持 OPENAI 和 ANTHROPIC");
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("模型测试失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    private String invokeOpenAi(ResolvedModelConfig config) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("input", "Reply with exactly OK.")
                .put("max_output_tokens", 32);

        HttpResponse<String> response = sendJsonPost(baseUrl + "/responses", config.apiKey(), payload);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return extractOpenAiText(objectMapper.readTree(response.body()));
        }
        if (response.statusCode() == 404) {
            return invokeOpenAiChatCompletions(baseUrl, config);
        }
        throw new IllegalStateException("OpenAI 接口调用失败：" + extractHttpError(response));
    }

    private String invokeOpenAiPrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, int maxTokens) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        JsonNode input = objectMapper.createArrayNode()
                .add(objectMapper.createObjectNode().put("role", "system").put("content", defaultString(systemPrompt)))
                .add(objectMapper.createObjectNode().put("role", "user").put("content", defaultString(userPrompt)));
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .set("input", input);
        ((ObjectNode) payload).put("max_output_tokens", maxTokens);

        HttpResponse<String> response = sendJsonPost(baseUrl + "/responses", config.apiKey(), payload);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return extractOpenAiText(objectMapper.readTree(response.body()));
        }
        if (response.statusCode() == 404) {
            return invokeOpenAiChatCompletionsPrompt(baseUrl, config, systemPrompt, userPrompt, maxTokens);
        }
        throw new IllegalStateException("OpenAI 接口调用失败：" + extractHttpError(response));
    }

    private String invokeOpenAiChatCompletions(String baseUrl, ResolvedModelConfig config) throws IOException, InterruptedException {
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("temperature", 0)
                .put("max_tokens", 32)
                .set("messages", objectMapper.createArrayNode().add(
                        objectMapper.createObjectNode()
                                .put("role", "user")
                                .put("content", "Reply with exactly OK.")
                ));

        HttpResponse<String> response = sendJsonPost(baseUrl + "/chat/completions", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Chat Completions 调用失败：" + extractHttpError(response));
        }
        return extractOpenAiChatText(objectMapper.readTree(response.body()));
    }

    private String invokeOpenAiChatCompletionsPrompt(String baseUrl,
                                                     ResolvedModelConfig config,
                                                     String systemPrompt,
                                                     String userPrompt,
                                                     int maxTokens) throws IOException, InterruptedException {
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("temperature", 0)
                .put("max_tokens", maxTokens)
                .set("messages", objectMapper.createArrayNode()
                        .add(objectMapper.createObjectNode()
                                .put("role", "system")
                                .put("content", defaultString(systemPrompt)))
                        .add(objectMapper.createObjectNode()
                                .put("role", "user")
                                .put("content", defaultString(userPrompt))));

        HttpResponse<String> response = sendJsonPost(baseUrl + "/chat/completions", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Chat Completions 调用失败：" + extractHttpError(response));
        }
        return extractOpenAiChatText(objectMapper.readTree(response.body()));
    }

    private String invokeAnthropic(ResolvedModelConfig config) throws IOException, InterruptedException {
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("max_tokens", 32)
                .put("temperature", 0)
                .set("messages", objectMapper.createArrayNode().add(
                        objectMapper.createObjectNode()
                                .put("role", "user")
                                .put("content", "Reply with exactly OK.")
                ));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimSlash(config.apiBaseUrl()) + "/messages"))
                .timeout(MODEL_REQUEST_TIMEOUT)
                .header("x-api-key", config.apiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Anthropic 接口调用失败：" + extractHttpError(response));
        }
        return extractAnthropicText(objectMapper.readTree(response.body()));
    }

    private String invokeAnthropicPrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, int maxTokens) throws IOException, InterruptedException {
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("max_tokens", maxTokens)
                .put("temperature", 0)
                .put("system", defaultString(systemPrompt))
                .set("messages", objectMapper.createArrayNode().add(
                        objectMapper.createObjectNode()
                                .put("role", "user")
                                .put("content", defaultString(userPrompt))
                ));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(trimSlash(config.apiBaseUrl()) + "/messages"))
                .timeout(MODEL_REQUEST_TIMEOUT)
                .header("x-api-key", config.apiKey())
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Anthropic 接口调用失败：" + extractHttpError(response));
        }
        return extractAnthropicText(objectMapper.readTree(response.body()));
    }

    private String extractOpenAiText(JsonNode body) {
        if (body.path("output_text").isTextual() && hasText(body.path("output_text").asText())) {
            return body.path("output_text").asText();
        }
        for (JsonNode output : body.path("output")) {
            for (JsonNode content : output.path("content")) {
                if (("output_text".equals(content.path("type").asText()) || "text".equals(content.path("type").asText()))
                        && hasText(content.path("text").asText())) {
                    return content.path("text").asText();
                }
            }
        }
        return body.toString();
    }

    private String extractOpenAiChatText(JsonNode body) {
        JsonNode choices = body.path("choices");
        if (choices.isArray() && !choices.isEmpty()) {
            JsonNode message = choices.get(0).path("message");
            if (message.path("content").isTextual()) {
                return message.path("content").asText();
            }
        }
        return body.toString();
    }

    private HttpResponse<String> sendJsonPost(String url, String apiKey, JsonNode payload) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(MODEL_REQUEST_TIMEOUT)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private String extractAnthropicText(JsonNode body) {
        for (JsonNode content : body.path("content")) {
            if ("text".equals(content.path("type").asText()) && hasText(content.path("text").asText())) {
                return content.path("text").asText();
            }
        }
        return body.toString();
    }

    private String extractHttpError(HttpResponse<String> response) {
        try {
            JsonNode node = objectMapper.readTree(response.body());
            if (node.hasNonNull("error")) {
                JsonNode error = node.get("error");
                if (error.isTextual()) {
                    return error.asText();
                }
                if (error.hasNonNull("message")) {
                    return error.get("message").asText();
                }
                return error.toString();
            }
            if (node.hasNonNull("message")) {
                return node.get("message").asText();
            }
        } catch (Exception ignored) {
        }
        return "HTTP " + response.statusCode();
    }

    private AiModelConfigEntity requireConfig(Long id) {
        return aiModelConfigRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + id));
    }

    private String normalizeProvider(String provider) {
        String value = provider == null ? "" : provider.trim().toUpperCase();
        if (!"OPENAI".equals(value) && !"ANTHROPIC".equals(value)) {
            throw new IllegalArgumentException("仅支持 OPENAI 和 ANTHROPIC");
        }
        return value;
    }

    private String resolveApiBaseUrl(String provider, String apiBaseUrl) {
        if (hasText(apiBaseUrl)) {
            return trimSlash(apiBaseUrl.trim());
        }
        return "ANTHROPIC".equals(normalizeProvider(provider))
                ? "https://api.anthropic.com/v1"
                : "https://api.openai.com/v1";
    }

    private String requireApiKey(String apiKey) {
        if (!hasText(apiKey)) {
            throw new IllegalArgumentException("API Key 不能为空");
        }
        return apiKey.trim();
    }

    private String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private String abbreviate(String value, int maxLength) {
        if (!hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "模型测试失败";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public record ResolvedModelConfig(Long id, String name, String provider, String apiBaseUrl, String modelName, String apiKey) {
    }
}
