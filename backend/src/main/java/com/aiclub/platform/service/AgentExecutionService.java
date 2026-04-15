package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.dto.AgentTestResult;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.repository.AgentRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class AgentExecutionService {

    private static final Logger log = LoggerFactory.getLogger(AgentExecutionService.class);

    public static final String ACCESS_BUILT_IN = "BUILT_IN";
    public static final String ACCESS_LLM_PROMPT = "LLM_PROMPT";
    public static final String ACCESS_HTTP_API = "HTTP_API";
    public static final String ACCESS_AGENT_RUNTIME = "AGENT_RUNTIME";

    public static final String RUNTIME_OPENCLAW = "OPENCLAW";

    public static final String BUILTIN_CODE_REVIEW = "CODE_REVIEW";
    public static final String BUILTIN_TEST_SUGGESTION = "TEST_SUGGESTION";
    public static final String BUILTIN_REQUIREMENT_BREAKDOWN = "REQUIREMENT_BREAKDOWN";
    public static final String BUILTIN_REPOSITORY_SCAN_PLAN = "REPOSITORY_SCAN_PLAN";

    private static final String HTTP_AUTH_NONE = "NONE";
    private static final String HTTP_AUTH_BEARER = "BEARER";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AgentRepository agentRepository;
    private final TokenCipherService tokenCipherService;
    private final ModelConfigService modelConfigService;
    private final CodeReviewClientService codeReviewClientService;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public AgentExecutionService(AgentRepository agentRepository,
                                 TokenCipherService tokenCipherService,
                                 ModelConfigService modelConfigService,
                                 CodeReviewClientService codeReviewClientService,
                                 ObjectMapper objectMapper) {
        this.agentRepository = agentRepository;
        this.tokenCipherService = tokenCipherService;
        this.modelConfigService = modelConfigService;
        this.codeReviewClientService = codeReviewClientService;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public AgentTestResult testAgent(Long agentId, String input) {
        AgentEntity agent = requireAgent(agentId);
        LocalDateTime testedAt = LocalDateTime.now();
        try {
            String output = executeTextAgent(agent, input, Map.of());
            return new AgentTestResult(
                    agent.getId(),
                    agent.getName(),
                    true,
                    "测试完成",
                    defaultString(output),
                    formatTime(testedAt)
            );
        } catch (RuntimeException exception) {
            log.warn("Agent test failed: agentId={}, agentName={}, accessType={}, message={}",
                    agent.getId(),
                    agent.getName(),
                    agent.getAccessType(),
                    exception.getMessage(),
                    exception);
            return new AgentTestResult(
                    agent.getId(),
                    agent.getName(),
                    false,
                    limitMessage(exception.getMessage()),
                    null,
                    formatTime(testedAt)
            );
        }
    }

    public String runAgent(Long agentId, String input) {
        return runAgent(agentId, input, Map.of());
    }

    public String runAgent(Long agentId, String input, Map<String, String> variables) {
        AgentEntity agent = requireAgent(agentId);
        return executeTextAgent(agent, input, variables);
    }

    /**
     * 供执行中心等编排服务读取智能体基础信息，用于步骤展示或输入快照组装。
     */
    public AgentEntity loadAgent(Long agentId) {
        return requireAgent(agentId);
    }

    public CodeReviewResult reviewMergeRequest(Long agentId,
                                               GitlabApiService.GitlabMergeRequest mergeRequest,
                                               GitlabApiService.GitlabMergeRequestChanges changes) {
        AgentEntity agent = requireAgent(agentId);
        validateEnabled(agent);
        if (!ACCESS_BUILT_IN.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_CODE_REVIEW.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("? Agent ????? GitLab AI ????? Code Review Agent");
        }
        return executeBuiltinCodeReview(agent, mergeRequest, changes);
    }

    public void validateCodeReviewAgent(Long agentId) {
        AgentEntity agent = requireAgent(agentId);
        validateEnabled(agent);
        if (!ACCESS_BUILT_IN.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_CODE_REVIEW.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("????? Code Review Agent");
        }
        requireAiModelConfigId(agent);
    }

    /**
     * 校验仓库扫描计划智能体是否具备生成 executable plan 的能力。
     */
    public void validateRepositoryScanPlanAgent(Long agentId) {
        AgentEntity agent = requireAgent(agentId);
        validateEnabled(agent);
        if (!ACCESS_BUILT_IN.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_REPOSITORY_SCAN_PLAN.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("所选智能体不是可用的仓库扫描计划智能体");
        }
        requireAiModelConfigId(agent);
    }

    private String executeTextAgent(AgentEntity agent, String input, Map<String, String> variables) {
        validateEnabled(agent);
        return switch (normalizeAccessType(agent.getAccessType())) {
            case ACCESS_BUILT_IN -> executeBuiltInTextAgent(agent, input);
            case ACCESS_LLM_PROMPT -> executeLlmPromptAgent(agent, input, variables);
            case ACCESS_HTTP_API -> executeHttpApiAgent(agent, input);
            case ACCESS_AGENT_RUNTIME -> executeRuntimeAgent(agent, input, variables);
            default -> throw new IllegalArgumentException("???? Agent ????");
        };
    }

    private String executeBuiltInTextAgent(AgentEntity agent, String input) {
        String builtinCode = trimToNull(agent.getBuiltinCode());
        if (builtinCode == null) {
            if (agent.getAiModelConfig() == null) {
                throw new IllegalArgumentException("当前内置 Agent 未配置可执行能力，请补充模型配置或内置能力编码");
            }
            return invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : defaultGenericBuiltinPrompt(agent),
                    defaultString(input)
            );
        }

        return switch (normalizeBuiltinCode(builtinCode)) {
            case BUILTIN_CODE_REVIEW -> executeBuiltinCodeReviewAsMarkdown(agent, input);
            case BUILTIN_TEST_SUGGESTION -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : defaultTestSuggestionPrompt(),
                    """
                            请基于以下内容输出测试建议，结果请使用 Markdown 格式。

                            """ + defaultString(input)
            );
            case BUILTIN_REQUIREMENT_BREAKDOWN -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : defaultRequirementBreakdownPrompt(),
                    """
                            请基于以下内容进行需求拆解，结果请使用 Markdown 格式。

                            """ + defaultString(input)
            );
            case BUILTIN_REPOSITORY_SCAN_PLAN -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : defaultRepositoryScanPlanPrompt(),
                    """
                            请基于以下仓库扫描上下文生成 AI 可执行计划。
                            输出要求：
                            1. 必须返回 JSON
                            2. 不要输出 Markdown 代码块围栏
                            3. shards 中只能引用输入里出现过的 shardId

                            """ + defaultString(input)
            );
            default -> throw new IllegalArgumentException("?????? Agent ??");
        };
    }

    /**
     * 对未指定 builtinCode 但已配置模型的“内置 Agent”提供兜底执行能力，方便首版执行中心复用现有 Agent 配置。
     */
    private String defaultGenericBuiltinPrompt(AgentEntity agent) {
        return """
                你是平台内置的通用执行智能体，请根据用户输入完成任务。
                输出要求：
                1. 使用 Markdown
                2. 先给出结论，再给出步骤或建议
                3. 如果信息不足，明确指出缺失信息与风险
                4. 如果输入包含工作项上下文，请优先围绕工作项目标、实现路径、测试与风险进行回答
                Agent名称：%s
                Agent类型：%s
                Agent能力：%s
                """.formatted(
                defaultString(agent.getName()),
                defaultString(agent.getType()),
                defaultString(agent.getCapability())
        ).trim();
    }

    private String executeBuiltinCodeReviewAsMarkdown(AgentEntity agent, String input) {
        GitlabApiService.GitlabMergeRequest mergeRequest = new GitlabApiService.GitlabMergeRequest(
                0L,
                "Agent ?? Code Review",
                "opened",
                "feature/test",
                "main",
                false,
                false,
                "can_be_merged",
                "success",
                "Agent Tester",
                "agent-tester",
                "",
                "",
                0
        );
        GitlabApiService.GitlabMergeRequestChanges changes = new GitlabApiService.GitlabMergeRequestChanges(
                0L,
                mergeRequest.title(),
                "Agent ?????? Code Review ??",
                List.of(new GitlabApiService.GitlabChange(
                        "sample.txt",
                        "sample.txt",
                        defaultString(input),
                        false,
                        false,
                        false
                ))
        );
        return executeBuiltinCodeReview(agent, mergeRequest, changes).reviewMarkdown();
    }

    private CodeReviewResult executeBuiltinCodeReview(AgentEntity agent,
                                                      GitlabApiService.GitlabMergeRequest mergeRequest,
                                                      GitlabApiService.GitlabMergeRequestChanges changes) {
        Long modelConfigId = requireAiModelConfigId(agent);
        ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(modelConfigId);
        String prompt = hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt().trim() : defaultCodeReviewPrompt();
        return codeReviewClientService.reviewMergeRequest(modelConfig, prompt, mergeRequest, changes);
    }

    private String executeLlmPromptAgent(AgentEntity agent, String input, Map<String, String> variables) {
        Long modelConfigId = requireAiModelConfigId(agent);
        String systemPrompt = hasText(agent.getSystemPrompt())
                ? agent.getSystemPrompt()
                : "?????? AI Agent????????????????????? Markdown ???";
        String userPrompt = hasText(agent.getUserPromptTemplate())
                ? renderTemplate(agent.getUserPromptTemplate(), buildTemplateVariables(input, systemPrompt, variables))
                : defaultString(input);
        return modelConfigService.invokePrompt(modelConfigId, systemPrompt, userPrompt);
    }

    private String executeHttpApiAgent(AgentEntity agent, String input) {
        String endpointUrl = trimToNull(agent.getEndpointUrl());
        if (endpointUrl == null) {
            throw new IllegalArgumentException("HTTP API Agent ????????");
        }
        String httpMethod = normalizeHttpMethod(agent.getHttpMethod());
        String requestBody = buildHttpRequestBody(agent, input);
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(endpointUrl))
                    .timeout(Duration.ofSeconds(resolveTimeoutSeconds(agent)));

            applyHttpHeaders(builder, agent, httpMethod);

            if ("GET".equals(httpMethod)) {
                builder.GET();
            } else {
                builder.method(httpMethod, HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8));
            }

            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("HTTP API Agent ?????HTTP ???: "
                        + response.statusCode() + "???: " + abbreviate(response.body(), 1000));
            }
            return extractHttpResponse(agent, response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("HTTP API Agent ????", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("HTTP API Agent ?????", exception);
        }
    }

    private String executeRuntimeAgent(AgentEntity agent, String input, Map<String, String> variables) {
        String runtimeType = normalizeRuntimeType(agent.getRuntimeType());
        return switch (runtimeType) {
            case RUNTIME_OPENCLAW -> executeOpenclawRuntime(agent, input, variables);
            default -> throw new IllegalArgumentException("Unsupported agent runtime type: " + runtimeType);
        };
    }

    private String executeOpenclawRuntime(AgentEntity agent, String input, Map<String, String> variables) {
        String endpointUrl = trimToNull(agent.getEndpointUrl());
        if (endpointUrl == null) {
            throw new IllegalArgumentException("OpenClaw runtime endpoint is required");
        }
        String runtimeAgentRef = trimToNull(agent.getRuntimeAgentRef());
        if (runtimeAgentRef == null) {
            throw new IllegalArgumentException("OpenClaw runtime agent ref is required");
        }

        String systemPrompt = defaultString(agent.getSystemPrompt());
        String renderedInput = hasText(agent.getUserPromptTemplate())
                ? renderTemplate(agent.getUserPromptTemplate(), buildTemplateVariables(input, systemPrompt, variables))
                : defaultString(input);
        String sessionKey = buildRuntimeSessionKey(agent, variables);
        String baseUrl = trimTrailingSlash(endpointUrl);

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("model", "openclaw/" + runtimeAgentRef);
            payload.put("input", renderedInput);
            if (hasText(systemPrompt)) {
                payload.put("instructions", systemPrompt);
            }
            if (hasText(sessionKey)) {
                payload.put("user", sessionKey);
            }

            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/v1/responses"))
                    .timeout(Duration.ofSeconds(resolveTimeoutSeconds(agent)))
                    .header("Accept", "application/json")
                    .header("Content-Type", "application/json");

            applyRuntimeAuth(builder, agent);
            if (hasText(sessionKey)) {
                builder.header("x-openclaw-session-key", sessionKey);
            }

            HttpResponse<String> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(payload.toString(), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("OpenClaw runtime HTTP " + response.statusCode() + ": " + abbreviate(response.body(), 1000));
            }
            return extractOpenResponseText(response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("OpenClaw runtime request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("OpenClaw runtime request interrupted", exception);
        }
    }

    private void applyHttpHeaders(HttpRequest.Builder builder, AgentEntity agent, String httpMethod) throws IOException {
        builder.header("Accept", "application/json");
        if (!"GET".equals(httpMethod)) {
            builder.header("Content-Type", "application/json");
        }
        String headers = trimToNull(agent.getHttpHeaders());
        if (headers != null) {
            JsonNode headersNode = objectMapper.readTree(headers);
            if (!headersNode.isObject()) {
                throw new IllegalArgumentException("HTTP Headers ??? JSON ??");
            }
            Iterator<Map.Entry<String, JsonNode>> fields = headersNode.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                builder.header(field.getKey(), field.getValue().asText(""));
            }
        }
        String authType = normalizeHttpAuthType(agent.getHttpAuthType());
        if (HTTP_AUTH_BEARER.equals(authType)) {
            if (!hasText(agent.getHttpAuthTokenCiphertext())) {
                throw new IllegalArgumentException("HTTP API Agent ??? Bearer ??????? Token");
            }
            builder.header("Authorization", "Bearer " + tokenCipherService.decrypt(agent.getHttpAuthTokenCiphertext()));
        }
    }

    private String buildHttpRequestBody(AgentEntity agent, String input) {
        String requestTemplate = trimToNull(agent.getHttpRequestTemplate());
        if (requestTemplate == null) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("input", defaultString(input));
            return payload.toString();
        }
        return renderTemplate(requestTemplate, buildTemplateVariables(input, agent.getSystemPrompt()));
    }

    private void applyRuntimeAuth(HttpRequest.Builder builder, AgentEntity agent) {
        String authType = normalizeHttpAuthType(agent.getHttpAuthType());
        if (HTTP_AUTH_BEARER.equals(authType)) {
            if (!hasText(agent.getHttpAuthTokenCiphertext())) {
                throw new IllegalArgumentException("Agent runtime bearer token is not configured");
            }
            builder.header("Authorization", "Bearer " + tokenCipherService.decrypt(agent.getHttpAuthTokenCiphertext()));
        }
    }

    private String buildRuntimeSessionKey(AgentEntity agent, Map<String, String> variables) {
        String template = trimToNull(agent.getRuntimeSessionKeyTemplate());
        if (template == null) {
            return trimToNull(variables.get("session_key"));
        }
        return trimToNull(renderTemplate(template, buildTemplateVariables("", agent.getSystemPrompt(), variables)));
    }

    private Map<String, String> buildTemplateVariables(String input, String systemPrompt) {
        return buildTemplateVariables(input, systemPrompt, Map.of());
    }

    private Map<String, String> buildTemplateVariables(String input, String systemPrompt, Map<String, String> extraVariables) {
        Map<String, String> variables = new LinkedHashMap<>();
        variables.put("input", defaultString(input));
        variables.put("input_json", toJsonString(defaultString(input)));
        variables.put("system_prompt", defaultString(systemPrompt));
        variables.put("system_prompt_json", toJsonString(defaultString(systemPrompt)));
        if (extraVariables != null) {
            for (Map.Entry<String, String> entry : extraVariables.entrySet()) {
                variables.put(entry.getKey(), defaultString(entry.getValue()));
            }
        }
        return variables;
    }

    private String renderTemplate(String template, Map<String, String> variables) {
        String result = defaultString(template);
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}", entry.getValue());
        }
        return result;
    }

    private String extractHttpResponse(AgentEntity agent, String responseBody) {
        String responsePath = trimToNull(agent.getHttpResponsePath());
        if (!hasText(responseBody)) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            if (responsePath != null) {
                JsonNode target = readJsonPath(node, responsePath);
                if (target == null || target.isMissingNode() || target.isNull()) {
                    return responseBody;
                }
                return target.isTextual() ? target.asText() : target.toPrettyString();
            }
            if (node.hasNonNull("output")) {
                return node.get("output").isTextual() ? node.get("output").asText() : node.get("output").toPrettyString();
            }
            if (node.hasNonNull("content")) {
                return node.get("content").isTextual() ? node.get("content").asText() : node.get("content").toPrettyString();
            }
            if (node.hasNonNull("message")) {
                return node.get("message").asText(responseBody);
            }
            return node.toPrettyString();
        } catch (Exception ignored) {
            return responseBody;
        }
    }

    private String extractOpenResponseText(String responseBody) {
        if (!hasText(responseBody)) {
            return "";
        }
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            if (node.path("output_text").isTextual() && hasText(node.path("output_text").asText())) {
                return node.path("output_text").asText();
            }
            for (JsonNode output : node.path("output")) {
                for (JsonNode content : output.path("content")) {
                    String type = content.path("type").asText();
                    if (("output_text".equals(type) || "text".equals(type)) && hasText(content.path("text").asText())) {
                        return content.path("text").asText();
                    }
                }
            }
            if (node.hasNonNull("error")) {
                JsonNode error = node.get("error");
                if (error.hasNonNull("message")) {
                    throw new IllegalStateException(error.get("message").asText());
                }
                throw new IllegalStateException(error.toString());
            }
            return node.toPrettyString();
        } catch (IOException exception) {
            return responseBody;
        }
    }

    private JsonNode readJsonPath(JsonNode node, String responsePath) {
        JsonNode current = node;
        for (String segment : responsePath.split("\\.")) {
            if (current == null) {
                return null;
            }
            current = current.path(segment);
        }
        return current;
    }

    private String invokeModelAgent(AgentEntity agent, String systemPrompt, String userPrompt) {
        Long modelConfigId = requireAiModelConfigId(agent);
        return modelConfigService.invokePrompt(modelConfigId, systemPrompt, userPrompt);
    }

    private Long requireAiModelConfigId(AgentEntity agent) {
        if (agent.getAiModelConfig() == null) {
            throw new IllegalArgumentException("?? Agent ?????");
        }
        return agent.getAiModelConfig().getId();
    }

    private void validateEnabled(AgentEntity agent) {
        if (!Boolean.TRUE.equals(agent.getEnabled())) {
            throw new IllegalArgumentException("?? Agent ???");
        }
    }

    private AgentEntity requireAgent(Long id) {
        return agentRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Agent ???: " + id));
    }

    private int resolveTimeoutSeconds(AgentEntity agent) {
        Integer timeoutSeconds = agent.getTimeoutSeconds();
        if (timeoutSeconds == null) {
            return 60;
        }
        return Math.max(5, Math.min(timeoutSeconds, 300));
    }

    private String normalizeAccessType(String value) {
        String normalized = trimToNull(value);
        normalized = normalized == null ? ACCESS_BUILT_IN : normalized.toUpperCase();
        if (!ACCESS_BUILT_IN.equals(normalized)
                && !ACCESS_LLM_PROMPT.equals(normalized)
                && !ACCESS_HTTP_API.equals(normalized)
                && !ACCESS_AGENT_RUNTIME.equals(normalized)) {
            throw new IllegalArgumentException("Agent access type must be BUILT_IN, LLM_PROMPT, HTTP_API, or AGENT_RUNTIME");
        }
        return normalized;
    }

    private String normalizeRuntimeType(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException("Agent runtime type is required");
        }
        normalized = normalized.toUpperCase();
        if (!RUNTIME_OPENCLAW.equals(normalized)) {
            throw new IllegalArgumentException("Unsupported runtime type: " + normalized);
        }
        return normalized;
    }

    private String normalizeBuiltinCode(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException("?? Agent ????????");
        }
        normalized = normalized.toUpperCase();
        if (!BUILTIN_CODE_REVIEW.equals(normalized)
                && !BUILTIN_TEST_SUGGESTION.equals(normalized)
                && !BUILTIN_REQUIREMENT_BREAKDOWN.equals(normalized)
                && !BUILTIN_REPOSITORY_SCAN_PLAN.equals(normalized)) {
            throw new IllegalArgumentException("?????? Agent ??");
        }
        return normalized;
    }

    private String normalizeHttpMethod(String value) {
        String method = trimToNull(value);
        method = method == null ? "POST" : method.toUpperCase();
        if (!"POST".equals(method) && !"PUT".equals(method) && !"GET".equals(method)) {
            throw new IllegalArgumentException("HTTP API Agent ??? GET?POST?PUT");
        }
        return method;
    }

    private String normalizeHttpAuthType(String value) {
        String authType = trimToNull(value);
        authType = authType == null ? HTTP_AUTH_NONE : authType.toUpperCase();
        if (!HTTP_AUTH_NONE.equals(authType) && !HTTP_AUTH_BEARER.equals(authType)) {
            throw new IllegalArgumentException("HTTP API Agent ??????? NONE?BEARER");
        }
        return authType;
    }

    private String defaultCodeReviewPrompt() {
        return """
                ?????????????? Merge Request ????????????????
                ?????
                1. ?????? bug ??????????????
                2. ???????????????????????SQL/???????
                3. ?????????????????
                4. ??????????????????????????????

                ???? JSON??????
                {"approved": true/false, "summary": "...", "issues": ["..."]}

                ??????????approved ??? false?
                """;
    }

    private String defaultTestSuggestionPrompt() {
        return """
                ???????????
                ????????? Markdown ?????????????
                1. ????
                2. ????
                3. ????
                4. ???
                5. ?????
                ?????????????????????
                """;
    }

    private String defaultRequirementBreakdownPrompt() {
        return """
                ???????????
                ??????????????????? Markdown ????????
                1. ?????
                2. ????????????????
                3. ??????
                4. ????
                ?????????????????????
                """;
    }

    /**
     * 仓库扫描计划智能体默认提示词，要求直接输出结构化 JSON，便于执行中心做强校验和降级兜底。
     */
    private String defaultRepositoryScanPlanPrompt() {
        return """
                你是平台内置的仓库扫描计划智能体，负责根据扫描报告生成后续 code agent 可执行计划。
                你必须直接返回 JSON，不要输出 Markdown 代码块或额外解释。
                请严格遵守用户输入中给出的输出协议和字段要求。
                通用约束：
                1. 所有字段内容请使用中文
                2. 不要编造输入中不存在的 shardId、路径或规则
                3. 如果当前输入要求按分片分析，请只返回当前分片的分析结果
                4. 如果当前输入要求返回最终 executable plan，请完整输出最终计划 JSON
                """;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String trimTrailingSlash(String value) {
        String result = defaultString(value);
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "测试执行失败";
        }
        String value = message.trim();
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    private String abbreviate(String value, int maxLength) {
        if (!hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    private String toJsonString(String value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return "\"\"";
        }
    }
}
