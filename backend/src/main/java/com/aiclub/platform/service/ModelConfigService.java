package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationContextHolder;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.TriggerSource;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.AiModelConfigSummary;
import com.aiclub.platform.dto.ModelTestResult;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.AiModelConfigRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
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

    public static final String MODEL_TYPE_CHAT = "CHAT";
    public static final String MODEL_TYPE_EMBEDDING = "EMBEDDING";
    public static final String PROVIDER_OPENAI = "OPENAI";
    public static final String PROVIDER_ANTHROPIC = "ANTHROPIC";
    public static final String OPENAI_API_MODE_AUTO = "AUTO";
    public static final String OPENAI_API_MODE_RESPONSES = "RESPONSES";
    public static final String OPENAI_API_MODE_CHAT_COMPLETIONS = "CHAT_COMPLETIONS";
    public static final String OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN = "CHAT_COMPLETIONS_PLAIN";

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Duration MODEL_REQUEST_TIMEOUT = Duration.ofSeconds(120);

    private final AiModelConfigRepository aiModelConfigRepository;
    private final TokenCipherService tokenCipherService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /**
     * 智能体调用日志记录器，仅在 {@code invokePromptWithUsage} 兜底分支使用。
     * 业务层主动埋点的调用不会重复落账。@Autowired(required=false) 兼容启动期单元测试环境。
     */
    @Autowired(required = false)
    private AgentInvocationRecorder agentInvocationRecorder;

    public ModelConfigService(AiModelConfigRepository aiModelConfigRepository,
                              TokenCipherService tokenCipherService,
                              ObjectMapper objectMapper) {
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.tokenCipherService = tokenCipherService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public PageResponse<AiModelConfigSummary> pageConfigs(int page, int size, String keyword, String provider, String modelType, Boolean enabled) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.ASC, "id"));
        Page<AiModelConfigSummary> pageData = aiModelConfigRepository.findAll(buildSpecification(keyword, provider, modelType, enabled), pageable)
                .map(this::toSummary);
        return PageResponse.from(pageData);
    }

    public List<AiModelConfigSummary> listEnabledOptions() {
        return listEnabledOptions(MODEL_TYPE_CHAT);
    }

    public List<AiModelConfigSummary> listEnabledOptions(String modelType) {
        String normalizedModelType = hasText(modelType) ? normalizeModelType(modelType) : MODEL_TYPE_CHAT;
        return aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(normalizedModelType).stream()
                .map(this::toSummary)
                .toList();
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
            String message = isEmbeddingModelType(config.modelType())
                    ? invokeEmbeddingTest(config)
                    : invokeChatTest(config);
            return new ModelTestResult(
                    config.id(),
                    config.name(),
                    config.modelType(),
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
                    config.modelType(),
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
                entity.getModelType(),
                entity.getProvider(),
                entity.getApiBaseUrl(),
                entity.getModelName(),
                normalizeOpenAiApiMode(entity.getProvider(), entity.getOpenaiApiMode()),
                tokenCipherService.decrypt(entity.getApiKeyCiphertext())
        );
    }

    public String invokePrompt(Long id, String systemPrompt, String userPrompt) {
        return invokePrompt(resolveModelConfig(id), systemPrompt, userPrompt, 2048);
    }

    /**
     * 快捷重载：通过模型配置 ID 调用并返回 usage 信息。
     */
    public ModelInvocation invokePromptWithUsage(Long id, String systemPrompt, String userPrompt) {
        return invokePromptWithUsage(resolveModelConfig(id), systemPrompt, userPrompt, 2048, false);
    }

    /**
     * 生成单条文本的向量，供 Wiki 知识索引等业务复用平台统一的 Embedding 模型配置。
     */
    public List<Double> generateEmbedding(Long id, String input) {
        return generateEmbedding(resolveModelConfig(id), input);
    }

    /**
     * 批量生成向量，避免业务层为多 chunk 建索时逐条重复握手。
     */
    public List<List<Double>> generateEmbeddings(Long id, List<String> inputs) {
        return generateEmbeddings(resolveModelConfig(id), inputs);
    }

    public String invokePrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, Integer maxTokens) {
        return invokePrompt(config, systemPrompt, userPrompt, maxTokens, false);
    }

    public String invokePrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, Integer maxTokens, boolean jsonMode) {
        return invokePromptWithUsage(config, systemPrompt, userPrompt, maxTokens, jsonMode).text();
    }

    /**
     * 调用支持图片输入的对话模型，并返回文本与 token usage。
     *
     * <p>业务层只传标准化后的 Base64 图片；不同 Provider 的 content 协议由本服务分别构造，
     * 避免把 Responses API 与 Chat Completions 的元素类型混用。</p>
     */
    public ModelInvocation invokeVisionPromptWithUsage(ResolvedModelConfig config,
                                                        String systemPrompt,
                                                        String textPrompt,
                                                        List<VisionImage> images,
                                                        Integer maxTokens) {
        String modelType = normalizeModelType(config.modelType());
        if (!MODEL_TYPE_CHAT.equals(modelType)) {
            throw new IllegalArgumentException("Embedding 模型不支持图片理解调用，请选择对话模型");
        }
        List<VisionImage> normalizedImages = images == null ? List.of() : images.stream()
                .filter(image -> image != null && hasText(image.mediaType()) && hasText(image.base64Data()))
                .toList();
        if (normalizedImages.isEmpty()) {
            throw new IllegalArgumentException("图片理解调用至少需要一张有效图片");
        }
        int safeMaxTokens = maxTokens == null ? 1500 : Math.max(64, Math.min(maxTokens, 8192));
        try {
            String provider = normalizeProvider(config.provider());
            if (PROVIDER_OPENAI.equals(provider)) {
                return invokeOpenAiVisionWithUsage(config, systemPrompt, textPrompt, normalizedImages, safeMaxTokens);
            }
            if (PROVIDER_ANTHROPIC.equals(provider)) {
                return invokeAnthropicVisionWithUsage(config, systemPrompt, textPrompt, normalizedImages, safeMaxTokens);
            }
            throw new IllegalArgumentException("仅支持 OPENAI 和 ANTHROPIC");
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("图片理解模型调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    /**
     * 调用模型生成文本并返回 token usage 信息。
     *
     * <p>若当前线程没有显式埋点上下文（{@link AgentInvocationContextHolder}），自动以
     * {@link AgentType#UNKNOWN_MODEL_CALL} 兜底落账，便于运维发现未埋点的 AI 服务。
     * Provider 解析 usage 字段：
     * <ul>
     *   <li>OpenAI Responses: {@code usage.input_tokens / output_tokens / total_tokens}</li>
     *   <li>OpenAI Chat Completions: {@code usage.prompt_tokens / completion_tokens / total_tokens}</li>
     *   <li>Anthropic: {@code usage.input_tokens / output_tokens}（total 应用层累加）</li>
     * </ul>
     */
    public ModelInvocation invokePromptWithUsage(ResolvedModelConfig config,
                                                  String systemPrompt,
                                                  String userPrompt,
                                                  Integer maxTokens,
                                                  boolean jsonMode) {
        // 底层兜底：未显式埋点时自动以 UNKNOWN_MODEL_CALL 落账。
        if (agentInvocationRecorder != null && !AgentInvocationContextHolder.isPresent()) {
            AiModelConfigEntity entity = aiModelConfigRepository.findById(config.id()).orElse(null);
            AgentInvocationContext fallbackCtx = AgentInvocationContext.builder(AgentType.UNKNOWN_MODEL_CALL)
                    .action(detectCallerClassName())
                    .triggerSource(TriggerSource.SYSTEM)
                    .modelConfigId(config.id())
                    .modelName(config.modelName())
                    .provider(config.provider())
                    .inputChars(charLength(systemPrompt) + charLength(userPrompt))
                    .build();
            return agentInvocationRecorder.trackWithUsage(fallbackCtx, sink -> {
                ModelInvocation inv = doInvokePromptWithUsage(config, systemPrompt, userPrompt, maxTokens, jsonMode);
                sink.setUsage(inv.promptTokens(), inv.completionTokens(), inv.totalTokens());
                sink.setOutputChars(charLength(inv.text()));
                return inv;
            });
        }
        return doInvokePromptWithUsage(config, systemPrompt, userPrompt, maxTokens, jsonMode);
    }

    private ModelInvocation doInvokePromptWithUsage(ResolvedModelConfig config,
                                                     String systemPrompt,
                                                     String userPrompt,
                                                     Integer maxTokens,
                                                     boolean jsonMode) {
        String modelType = normalizeModelType(config.modelType());
        if (!MODEL_TYPE_CHAT.equals(modelType)) {
            throw new IllegalArgumentException("Embedding 模型不支持文本生成调用，请选择对话模型");
        }
        String provider = normalizeProvider(config.provider());
        int safeMaxTokens = maxTokens == null ? 2048 : Math.max(64, Math.min(maxTokens, 8192));
        try {
            if (PROVIDER_OPENAI.equals(provider)) {
                return invokeOpenAiPromptWithUsage(config, systemPrompt, userPrompt, safeMaxTokens, jsonMode);
            }
            if (PROVIDER_ANTHROPIC.equals(provider)) {
                return invokeAnthropicPromptWithUsage(config, systemPrompt, userPrompt, safeMaxTokens);
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

    public List<Double> generateEmbedding(ResolvedModelConfig config, String input) {
        List<List<Double>> vectors = generateEmbeddings(config, List.of(input));
        if (vectors.isEmpty()) {
            throw new IllegalStateException("Embedding 接口未返回有效向量");
        }
        return vectors.get(0);
    }

    public List<List<Double>> generateEmbeddings(ResolvedModelConfig config, List<String> inputs) {
        String modelType = normalizeModelType(config.modelType());
        if (!MODEL_TYPE_EMBEDDING.equals(modelType)) {
            throw new IllegalArgumentException("仅 Embedding 模型支持生成向量");
        }
        String provider = normalizeProvider(config.provider());
        if (!PROVIDER_OPENAI.equals(provider)) {
            throw new IllegalArgumentException("Embedding 模型仅支持 OPENAI 兼容提供商");
        }
        List<String> normalizedInputs = (inputs == null ? List.<String>of() : inputs).stream()
                .map(this::defaultString)
                .filter(this::hasText)
                .toList();
        if (normalizedInputs.isEmpty()) {
            return List.of();
        }
        try {
            return invokeOpenAiEmbeddings(config, normalizedInputs);
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Embedding 调用失败：" + limitMessage(exception.getMessage()), exception);
        }
    }

    private void fillEntity(AiModelConfigEntity entity, AiModelConfigRequest request, boolean createMode) {
        String modelType = normalizeModelType(request.modelType());
        String provider = normalizeProvider(request.provider());
        validateProviderForModelType(provider, modelType);
        entity.setName(request.name().trim());
        entity.setModelType(modelType);
        entity.setProvider(provider);
        entity.setApiBaseUrl(resolveApiBaseUrl(provider, modelType, request.apiBaseUrl()));
        entity.setModelName(request.modelName().trim());
        entity.setOpenaiApiMode(normalizeOpenAiApiMode(provider, request.openaiApiMode()));
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

    private Specification<AiModelConfigEntity> buildSpecification(String keyword, String provider, String modelType, Boolean enabled) {
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
            if (hasText(modelType)) {
                predicates.add(cb.equal(root.get("modelType"), normalizeModelType(modelType)));
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
                normalizeModelType(entity.getModelType()),
                entity.getProvider(),
                entity.getApiBaseUrl(),
                entity.getModelName(),
                normalizeOpenAiApiMode(entity.getProvider(), entity.getOpenaiApiMode()),
                hasText(entity.getApiKeyCiphertext()),
                entity.getDescription(),
                entity.getEnabled()
        );
    }

    private String invokeChatTest(ResolvedModelConfig config) {
        String content = invokeChatTestPrompt(config);
        return hasText(content)
                ? "连接成功，模型已返回内容：" + abbreviate(content, 200)
                : "连接成功，模型接口调用正常。";
    }

    private String invokeEmbeddingTest(ResolvedModelConfig config) {
        int vectorDimension = invokeEmbeddingVectorDimension(config);
        return "连接成功，已生成 " + vectorDimension + " 维向量。";
    }

    private String invokeChatTestPrompt(ResolvedModelConfig config) {
        String provider = normalizeProvider(config.provider());
        try {
            if (PROVIDER_OPENAI.equals(provider)) {
                return invokeOpenAi(config);
            }
            if (PROVIDER_ANTHROPIC.equals(provider)) {
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

    private int invokeEmbeddingVectorDimension(ResolvedModelConfig config) {
        String modelType = normalizeModelType(config.modelType());
        String provider = normalizeProvider(config.provider());
        validateProviderForModelType(provider, modelType);
        if (!PROVIDER_OPENAI.equals(provider)) {
            throw new IllegalArgumentException("Embedding 模型仅支持 OPENAI 兼容提供商");
        }
        try {
            return invokeOpenAiEmbedding(config);
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
        if (OPENAI_API_MODE_CHAT_COMPLETIONS.equals(config.openaiApiMode())
                || OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            return invokeOpenAiChatCompletions(baseUrl, config);
        }
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

    private int invokeOpenAiEmbedding(ResolvedModelConfig config) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        JsonNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("input", "Embedding health check");

        HttpResponse<String> response = sendJsonPost(baseUrl + "/embeddings", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Embeddings 调用失败：" + extractHttpError(response));
        }
        return extractOpenAiEmbeddingDimension(objectMapper.readTree(response.body()));
    }

    private List<List<Double>> invokeOpenAiEmbeddings(ResolvedModelConfig config, List<String> inputs) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", config.modelName());
        ArrayNode inputArray = payload.putArray("input");
        for (String input : inputs) {
            inputArray.add(defaultString(input));
        }
        HttpResponse<String> response = sendJsonPost(baseUrl + "/embeddings", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Embeddings 调用失败：" + extractHttpError(response));
        }
        return extractOpenAiEmbeddings(objectMapper.readTree(response.body()));
    }

    private String invokeOpenAiPrompt(ResolvedModelConfig config, String systemPrompt, String userPrompt, int maxTokens, boolean jsonMode) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        if (OPENAI_API_MODE_CHAT_COMPLETIONS.equals(config.openaiApiMode())
                || OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            return invokeOpenAiChatCompletionsPrompt(baseUrl, config, systemPrompt, userPrompt, maxTokens, jsonMode);
        }
        JsonNode input = objectMapper.createArrayNode()
                .add(objectMapper.createObjectNode().put("role", "system").put("content", defaultString(systemPrompt)))
                .add(objectMapper.createObjectNode().put("role", "user").put("content", defaultString(userPrompt)));
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .set("input", input);
        payload.put("max_output_tokens", maxTokens);

        HttpResponse<String> response = sendJsonPost(baseUrl + "/responses", config.apiKey(), payload);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return extractOpenAiText(objectMapper.readTree(response.body()));
        }
        if (response.statusCode() == 404) {
            return invokeOpenAiChatCompletionsPrompt(baseUrl, config, systemPrompt, userPrompt, maxTokens, jsonMode);
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
                                                      int maxTokens,
                                                      boolean jsonMode) throws IOException, InterruptedException {
        ObjectNode payload = objectMapper.createObjectNode()
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

        if (jsonMode && !OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            payload.set("response_format", objectMapper.createObjectNode().put("type", "json_object"));
        }

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

    /**
     * OpenAI Prompt 调用并返回 usage 信息，行为与 {@link #invokeOpenAiPrompt} 保持一致。
     */
    private ModelInvocation invokeOpenAiPromptWithUsage(ResolvedModelConfig config,
                                                         String systemPrompt,
                                                         String userPrompt,
                                                         int maxTokens,
                                                         boolean jsonMode) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        if (OPENAI_API_MODE_CHAT_COMPLETIONS.equals(config.openaiApiMode())
                || OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            return invokeOpenAiChatCompletionsPromptWithUsage(baseUrl, config, systemPrompt, userPrompt, maxTokens, jsonMode);
        }
        JsonNode input = objectMapper.createArrayNode()
                .add(objectMapper.createObjectNode().put("role", "system").put("content", defaultString(systemPrompt)))
                .add(objectMapper.createObjectNode().put("role", "user").put("content", defaultString(userPrompt)));
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .set("input", input);
        payload.put("max_output_tokens", maxTokens);

        HttpResponse<String> response = sendJsonPost(baseUrl + "/responses", config.apiKey(), payload);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            JsonNode tree = objectMapper.readTree(response.body());
            String text = extractOpenAiText(tree);
            ModelInvocationUsage usage = extractOpenAiUsage(tree);
            return new ModelInvocation(text,
                    usage == null ? null : usage.input(),
                    usage == null ? null : usage.output(),
                    usage == null ? null : usage.total());
        }
        if (response.statusCode() == 404) {
            return invokeOpenAiChatCompletionsPromptWithUsage(baseUrl, config, systemPrompt, userPrompt, maxTokens, jsonMode);
        }
        throw new IllegalStateException("OpenAI 接口调用失败：" + extractHttpError(response));
    }

    /**
     * OpenAI 视觉调用。Responses 与 Chat Completions 使用不同 content 元素协议。
     */
    private ModelInvocation invokeOpenAiVisionWithUsage(ResolvedModelConfig config,
                                                         String systemPrompt,
                                                         String textPrompt,
                                                         List<VisionImage> images,
                                                         int maxTokens) throws IOException, InterruptedException {
        String baseUrl = trimSlash(config.apiBaseUrl());
        if (OPENAI_API_MODE_CHAT_COMPLETIONS.equals(config.openaiApiMode())
                || OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            return invokeOpenAiChatCompletionsVisionWithUsage(baseUrl, config, systemPrompt, textPrompt, images, maxTokens);
        }

        var content = objectMapper.createArrayNode();
        content.add(objectMapper.createObjectNode()
                .put("type", "input_text")
                .put("text", defaultString(textPrompt)));
        images.forEach(image -> content.add(objectMapper.createObjectNode()
                .put("type", "input_image")
                .put("image_url", image.dataUri())));
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("instructions", defaultString(systemPrompt))
                .put("max_output_tokens", maxTokens)
                .set("input", objectMapper.createArrayNode().add(
                        objectMapper.createObjectNode()
                                .put("role", "user")
                                .set("content", content)
                ));

        HttpResponse<String> response = sendJsonPost(baseUrl + "/responses", config.apiKey(), payload);
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            JsonNode tree = objectMapper.readTree(response.body());
            ModelInvocationUsage usage = extractOpenAiUsage(tree);
            return new ModelInvocation(
                    extractOpenAiText(tree),
                    usage == null ? null : usage.input(),
                    usage == null ? null : usage.output(),
                    usage == null ? null : usage.total()
            );
        }
        if (response.statusCode() == 404) {
            return invokeOpenAiChatCompletionsVisionWithUsage(baseUrl, config, systemPrompt, textPrompt, images, maxTokens);
        }
        throw new IllegalStateException("OpenAI 图片理解调用失败：" + extractHttpError(response));
    }

    private ModelInvocation invokeOpenAiChatCompletionsVisionWithUsage(String baseUrl,
                                                                        ResolvedModelConfig config,
                                                                        String systemPrompt,
                                                                        String textPrompt,
                                                                        List<VisionImage> images,
                                                                        int maxTokens) throws IOException, InterruptedException {
        var content = objectMapper.createArrayNode();
        content.add(objectMapper.createObjectNode().put("type", "text").put("text", defaultString(textPrompt)));
        images.forEach(image -> content.add(objectMapper.createObjectNode()
                .put("type", "image_url")
                .set("image_url", objectMapper.createObjectNode().put("url", image.dataUri()))));
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("temperature", 0)
                .put("max_tokens", maxTokens)
                .set("messages", objectMapper.createArrayNode()
                        .add(objectMapper.createObjectNode().put("role", "system").put("content", defaultString(systemPrompt)))
                        .add(objectMapper.createObjectNode().put("role", "user").set("content", content)));
        HttpResponse<String> response = sendJsonPost(baseUrl + "/chat/completions", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Chat Completions 图片理解调用失败：" + extractHttpError(response));
        }
        JsonNode tree = objectMapper.readTree(response.body());
        ModelInvocationUsage usage = extractOpenAiChatUsage(tree);
        return new ModelInvocation(
                extractOpenAiChatText(tree),
                usage == null ? null : usage.input(),
                usage == null ? null : usage.output(),
                usage == null ? null : usage.total()
        );
    }

    private ModelInvocation invokeAnthropicVisionWithUsage(ResolvedModelConfig config,
                                                             String systemPrompt,
                                                             String textPrompt,
                                                             List<VisionImage> images,
                                                             int maxTokens) throws IOException, InterruptedException {
        var content = objectMapper.createArrayNode();
        content.add(objectMapper.createObjectNode().put("type", "text").put("text", defaultString(textPrompt)));
        images.forEach(image -> content.add(objectMapper.createObjectNode()
                .put("type", "image")
                .set("source", objectMapper.createObjectNode()
                        .put("type", "base64")
                        .put("media_type", image.mediaType())
                        .put("data", image.base64Data()))));
        ObjectNode payload = objectMapper.createObjectNode()
                .put("model", config.modelName())
                .put("system", defaultString(systemPrompt))
                .put("max_tokens", maxTokens)
                .put("temperature", 0)
                .set("messages", objectMapper.createArrayNode().add(
                        objectMapper.createObjectNode().put("role", "user").set("content", content)
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
            throw new IllegalStateException("Anthropic 图片理解调用失败：" + extractHttpError(response));
        }
        JsonNode tree = objectMapper.readTree(response.body());
        ModelInvocationUsage usage = extractAnthropicUsage(tree);
        return new ModelInvocation(
                extractAnthropicText(tree),
                usage == null ? null : usage.input(),
                usage == null ? null : usage.output(),
                usage == null ? null : usage.total()
        );
    }

    private ModelInvocation invokeOpenAiChatCompletionsPromptWithUsage(String baseUrl,
                                                                       ResolvedModelConfig config,
                                                                       String systemPrompt,
                                                                       String userPrompt,
                                                                       int maxTokens,
                                                                       boolean jsonMode) throws IOException, InterruptedException {
        ObjectNode payload = objectMapper.createObjectNode()
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

        if (jsonMode && !OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(config.openaiApiMode())) {
            payload.set("response_format", objectMapper.createObjectNode().put("type", "json_object"));
        }

        HttpResponse<String> response = sendJsonPost(baseUrl + "/chat/completions", config.apiKey(), payload);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("OpenAI Chat Completions 调用失败：" + extractHttpError(response));
        }
        JsonNode tree = objectMapper.readTree(response.body());
        String text = extractOpenAiChatText(tree);
        ModelInvocationUsage usage = extractOpenAiChatUsage(tree);
        return new ModelInvocation(text,
                usage == null ? null : usage.input(),
                usage == null ? null : usage.output(),
                usage == null ? null : usage.total());
    }

    private ModelInvocation invokeAnthropicPromptWithUsage(ResolvedModelConfig config,
                                                            String systemPrompt,
                                                            String userPrompt,
                                                            int maxTokens) throws IOException, InterruptedException {
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
        JsonNode tree = objectMapper.readTree(response.body());
        String text = extractAnthropicText(tree);
        ModelInvocationUsage usage = extractAnthropicUsage(tree);
        return new ModelInvocation(text,
                usage == null ? null : usage.input(),
                usage == null ? null : usage.output(),
                usage == null ? null : usage.total());
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

    /**
     * 从 OpenAI Responses API 响应中提取 usage 信息。
     */
    private ModelInvocationUsage extractOpenAiUsage(JsonNode body) {
        JsonNode usage = body.path("usage");
        if (usage.isMissingNode() || usage.isNull()) {
            return null;
        }
        Integer inputTokens = jsonIntOrNull(usage.path("input_tokens"));
        Integer outputTokens = jsonIntOrNull(usage.path("output_tokens"));
        Integer totalTokens = jsonIntOrNull(usage.path("total_tokens"));
        if (inputTokens == null && outputTokens == null && totalTokens == null) {
            return null;
        }
        return new ModelInvocationUsage(inputTokens, outputTokens, totalTokens);
    }

    /**
     * 从 OpenAI Chat Completions 响应中提取 usage 信息。
     */
    private ModelInvocationUsage extractOpenAiChatUsage(JsonNode body) {
        JsonNode usage = body.path("usage");
        if (usage.isMissingNode() || usage.isNull()) {
            return null;
        }
        Integer prompt = jsonIntOrNull(usage.path("prompt_tokens"));
        Integer completion = jsonIntOrNull(usage.path("completion_tokens"));
        Integer total = jsonIntOrNull(usage.path("total_tokens"));
        if (prompt == null && completion == null && total == null) {
            return null;
        }
        return new ModelInvocationUsage(prompt, completion, total);
    }

    /**
     * 从 Anthropic Messages API 响应中提取 usage 信息。
     */
    private ModelInvocationUsage extractAnthropicUsage(JsonNode body) {
        JsonNode usage = body.path("usage");
        if (usage.isMissingNode() || usage.isNull()) {
            return null;
        }
        Integer inputTokens = jsonIntOrNull(usage.path("input_tokens"));
        Integer outputTokens = jsonIntOrNull(usage.path("output_tokens"));
        if (inputTokens == null && outputTokens == null) {
            return null;
        }
        Integer total = (inputTokens == null ? 0 : inputTokens) + (outputTokens == null ? 0 : outputTokens);
        return new ModelInvocationUsage(inputTokens, outputTokens, total);
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

    private int extractOpenAiEmbeddingDimension(JsonNode body) {
        JsonNode data = body.path("data");
        if (data.isArray() && !data.isEmpty()) {
            JsonNode embedding = data.get(0).path("embedding");
            if (embedding.isArray() && !embedding.isEmpty()) {
                return embedding.size();
            }
        }
        throw new IllegalStateException("Embedding 接口未返回有效向量");
    }

    private List<List<Double>> extractOpenAiEmbeddings(JsonNode body) {
        JsonNode data = body.path("data");
        if (!data.isArray() || data.isEmpty()) {
            throw new IllegalStateException("Embedding 接口未返回有效向量");
        }
        List<List<Double>> vectors = new ArrayList<>();
        for (JsonNode item : data) {
            JsonNode embedding = item.path("embedding");
            if (!embedding.isArray() || embedding.isEmpty()) {
                continue;
            }
            List<Double> vector = new ArrayList<>();
            for (JsonNode value : embedding) {
                vector.add(value.asDouble());
            }
            vectors.add(List.copyOf(vector));
        }
        if (vectors.isEmpty()) {
            throw new IllegalStateException("Embedding 接口未返回有效向量");
        }
        return List.copyOf(vectors);
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

    private String normalizeModelType(String modelType) {
        if (!hasText(modelType)) {
            return MODEL_TYPE_CHAT;
        }
        String value = modelType.trim().toUpperCase();
        if (!MODEL_TYPE_CHAT.equals(value) && !MODEL_TYPE_EMBEDDING.equals(value)) {
            throw new IllegalArgumentException("模型类型仅支持 CHAT 和 EMBEDDING");
        }
        return value;
    }

    private String normalizeProvider(String provider) {
        String value = provider == null ? "" : provider.trim().toUpperCase();
        if (!PROVIDER_OPENAI.equals(value) && !PROVIDER_ANTHROPIC.equals(value)) {
            throw new IllegalArgumentException("仅支持 OPENAI 和 ANTHROPIC");
        }
        return value;
    }

    /**
     * 统一归一化 OpenAI 兼容调用模式，非 OpenAI 提供商固定回落为 AUTO。
     */
    private String normalizeOpenAiApiMode(String provider, String openAiApiMode) {
        if (!PROVIDER_OPENAI.equals(normalizeProvider(provider))) {
            return OPENAI_API_MODE_AUTO;
        }
        if (!hasText(openAiApiMode)) {
            return OPENAI_API_MODE_AUTO;
        }
        String value = openAiApiMode.trim().toUpperCase();
        if (!OPENAI_API_MODE_AUTO.equals(value)
                && !OPENAI_API_MODE_RESPONSES.equals(value)
                && !OPENAI_API_MODE_CHAT_COMPLETIONS.equals(value)
                && !OPENAI_API_MODE_CHAT_COMPLETIONS_PLAIN.equals(value)) {
            throw new IllegalArgumentException("OpenAI 调用模式仅支持 AUTO、RESPONSES、CHAT_COMPLETIONS、CHAT_COMPLETIONS_PLAIN");
        }
        return value;
    }

    private void validateProviderForModelType(String provider, String modelType) {
        if (MODEL_TYPE_EMBEDDING.equals(modelType) && !PROVIDER_OPENAI.equals(provider)) {
            throw new IllegalArgumentException("Embedding 模型仅支持 OPENAI 兼容提供商");
        }
    }

    private String resolveApiBaseUrl(String provider, String modelType, String apiBaseUrl) {
        if (hasText(apiBaseUrl)) {
            return trimSlash(apiBaseUrl.trim());
        }
        return PROVIDER_ANTHROPIC.equals(normalizeProvider(provider))
                && MODEL_TYPE_CHAT.equals(normalizeModelType(modelType))
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

    private boolean isEmbeddingModelType(String modelType) {
        return MODEL_TYPE_EMBEDDING.equals(normalizeModelType(modelType));
    }

    /**
     * 下游统一使用该载荷读取模型连接信息，modelType 用于保护文本生成链路不误用 Embedding 模型。
     */
    public record ResolvedModelConfig(Long id, String name, String modelType, String provider, String apiBaseUrl, String modelName, String openaiApiMode, String apiKey) {
    }

    /**
     * 模型调用返回结果，含文本和 usage 信息。
     */
    public record ModelInvocation(String text, Integer promptTokens, Integer completionTokens, Integer totalTokens) {
    }

    /**
     * 图片理解的标准化输入。只在调用模型时临时保留 Base64，不写入日志或数据库。
     */
    public record VisionImage(int index, String mediaType, String base64Data, String sourceName) {
        public String dataUri() {
            return "data:" + mediaType + ";base64," + base64Data;
        }
    }

    // ---------- 内部用法解析 ----------

    /**
     * OpenAI / Anthropic usage 的私有解析中间类型。
     */
    private record ModelInvocationUsage(Integer input, Integer output, Integer total) {
    }

    /**
     * 从 JSON 节点中提取整数，缺失或非整型返回 null。
     */
    private static Integer jsonIntOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.canConvertToInt()) {
            return node.asInt();
        }
        return null;
    }

    /**
     * 计算字符串字符数（包括 null == 0）。
     */
    private static int charLength(String s) {
        return s == null ? 0 : s.length();
    }

    /**
     * 检测调用 ModelConfigService 的栈顶 Service 类名，供兜底埋点使用。
     */
    private static String detectCallerClassName() {
        StackWalker walker = StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE);
        return walker.walk(frames ->
                frames.skip(1) // 跳过自身
                        .filter(f -> {
                            String cn = f.getClassName();
                            return !cn.startsWith("com.aiclub.platform.service.ModelConfigService")
                                    && !cn.startsWith("java.")
                                    && !cn.startsWith("jdk.")
                                    && !cn.startsWith("org.springframework");
                        })
                        .findFirst()
                        .map(f -> {
                            String simpleName = f.getClassName();
                            int dot = simpleName.lastIndexOf('.');
                            return dot >= 0 ? simpleName.substring(dot + 1) : simpleName;
                        })
                        .orElse("UNKNOWN")
        );
    }
}
