package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.dto.AgentTestResult;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.repository.AgentRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.Optional;

@Service
@Transactional(readOnly = true)
public class AgentExecutionService {

    private static final Logger log = LoggerFactory.getLogger(AgentExecutionService.class);

    public static final String ACCESS_BUILT_IN = "BUILT_IN";
    public static final String ACCESS_LLM_PROMPT = "LLM_PROMPT";
    /** 由平台模型配置执行多模态图片理解。 */
    public static final String ACCESS_LLM_VISION = "LLM_VISION";
    public static final String ACCESS_HTTP_API = "HTTP_API";
    public static final String ACCESS_AGENT_RUNTIME = "AGENT_RUNTIME";

    public static final String RUNTIME_OPENCLAW = "OPENCLAW";
    public static final String RUNTIME_CODEX_CLI = "CODEX_CLI";
    public static final String RUNTIME_CLAUDE_CODE_CLI = "CLAUDE_CODE_CLI";
    public static final String RUNTIME_OPENCODE_CLI = "OPENCODE_CLI";
    public static final String RUNNER_PATROL_MODEL = "PATROL_MODEL";

    public static final String BUILTIN_CODE_REVIEW = "CODE_REVIEW";
    /** 全局图片理解 Agent 的稳定业务标识。 */
    public static final String BUILTIN_IMAGE_UNDERSTANDING = "IMAGE_UNDERSTANDING";
    public static final String BUILTIN_REPOSITORY_SCAN_PLAN = "REPOSITORY_SCAN_PLAN";
    public static final String BUILTIN_REQUIREMENT_AI_STANDARDIZE = "REQUIREMENT_AI_STANDARDIZE";
    public static final String BUILTIN_REQUIREMENT_AI_BREAKDOWN = "REQUIREMENT_AI_BREAKDOWN";
    public static final String BUILTIN_REQUIREMENT_AI_TEST_CASES = "REQUIREMENT_AI_TEST_CASES";

    private static final String HTTP_AUTH_NONE = "NONE";
    private static final String HTTP_AUTH_BEARER = "BEARER";
    private static final String CODE_PROCESSING_CLI_PATH = "/api/code/cli-executions";
    private static final String CODE_PROCESSING_CODEX_PATH = "/api/code/codex-executions";
    private static final String CODE_PROCESSING_CLAUDE_PATH = "/api/code/claude-plans";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AgentRepository agentRepository;
    private final TokenCipherService tokenCipherService;
    private final ModelConfigService modelConfigService;
    private final CodeReviewClientService codeReviewClientService;
    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String codeProcessingBaseUrl;
    private final AgentInvocationRecorder agentInvocationRecorder;

    public AgentExecutionService(AgentRepository agentRepository,
                                 TokenCipherService tokenCipherService,
                                 ModelConfigService modelConfigService,
                                 CodeReviewClientService codeReviewClientService,
                                 ObjectMapper objectMapper,
                                 InternalServiceAuthenticator internalServiceAuthenticator,
                                 AgentInvocationRecorder agentInvocationRecorder,
                                 @Value("${platform.code-processing.base-url}") String codeProcessingBaseUrl) {
        this.agentRepository = agentRepository;
        this.tokenCipherService = tokenCipherService;
        this.modelConfigService = modelConfigService;
        this.codeReviewClientService = codeReviewClientService;
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.objectMapper = objectMapper;
        this.agentInvocationRecorder = agentInvocationRecorder;
        this.codeProcessingBaseUrl = trimToNull(codeProcessingBaseUrl);
        // 本地 code-processing 运行在 Uvicorn/FastAPI 上，对 Java HttpClient 的 HTTP/2 升级握手兼容性较差；
        // 固定使用 HTTP/1.1，避免请求在到达应用层前就被 Uvicorn 以“Invalid HTTP request received”拒绝。
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
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

    /**
     * 解析平台启用的图片理解 Agent。使用 builtinCode 保证多条视觉 Agent 存在时仍能稳定定位。
     */
    public Optional<AgentEntity> resolveImageUnderstandingAgent() {
        return agentRepository.findFirstByBuiltinCodeAndEnabledTrueOrderByIdAsc(BUILTIN_IMAGE_UNDERSTANDING)
                .filter(agent -> ACCESS_LLM_VISION.equals(normalizeAccessType(agent.getAccessType())))
                .filter(agent -> agent.getProject() == null)
                .filter(agent -> agent.getAiModelConfig() != null);
    }

    /**
     * 执行图片理解并记录模型 usage。图片内容只在当前调用内存中存在，不进入普通 Agent 文本模板。
     */
    public String runVisionAgent(AgentEntity agent,
                                 List<ModelConfigService.VisionImage> images,
                                 String question) {
        validateEnabled(agent);
        if (!ACCESS_LLM_VISION.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_IMAGE_UNDERSTANDING.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("当前 Agent 不是可用的图片理解 Agent");
        }
        Long modelConfigId = requireAiModelConfigId(agent);
        ModelConfigService.ResolvedModelConfig resolved = modelConfigService.resolveModelConfig(modelConfigId);
        String systemPrompt = hasText(agent.getSystemPrompt())
                ? agent.getSystemPrompt().trim()
                : "你是图片理解助手，请按图片序号用中文描述界面、流程、字段和关键状态。";
        String textPrompt = hasText(question) ? question.trim() : "请描述图片内容。";
        AgentInvocationContext context = AgentInvocationContext.builder(AgentType.IMAGE_UNDERSTANDING)
                .action(BUILTIN_IMAGE_UNDERSTANDING)
                .agentId(agent.getId())
                .agentCode(BUILTIN_IMAGE_UNDERSTANDING)
                .modelConfig(agent.getAiModelConfig())
                .inputChars(systemPrompt.length() + textPrompt.length())
                .build();
        return agentInvocationRecorder.trackWithUsage(context, sink -> {
            ModelConfigService.ModelInvocation invocation = modelConfigService.invokeVisionPromptWithUsage(
                    resolved, systemPrompt, textPrompt, images, 1500);
            sink.setUsage(invocation.promptTokens(), invocation.completionTokens(), invocation.totalTokens());
            sink.setOutputChars(invocation.text() == null ? 0 : invocation.text().length());
            return invocation.text();
        });
    }

    public boolean supportsAsyncExecution(AgentEntity agent, String stepCode) {
        if (agent == null) {
            return false;
        }
        String accessType = normalizeAccessType(agent.getAccessType());
        if (ACCESS_HTTP_API.equals(accessType)) {
            String endpointUrl = trimToNull(agent.getEndpointUrl());
            if (endpointUrl == null) {
                return false;
            }
            String normalized = trimTrailingSlash(endpointUrl);
            return normalized.endsWith(CODE_PROCESSING_CODEX_PATH) || normalized.endsWith(CODE_PROCESSING_CLAUDE_PATH);
        }
        if (!ACCESS_AGENT_RUNTIME.equals(accessType)) {
            return false;
        }
        return isCliRuntime(agent) && resolveCliMode(stepCode) != null;
    }

    /**
     * 异步启动 runner 会话，仅等待 accepted 响应。
     */
    public AsyncExecutionStartResult startAsyncExecution(AgentEntity agent,
                                                         String input,
                                                         Map<String, String> variables,
                                                         int submitTimeoutSeconds,
                                                         int maxRuntimeSeconds) {
        validateEnabled(agent);
        if (!supportsAsyncExecution(agent, variables == null ? null : variables.get("step_code"))) {
            throw new IllegalArgumentException("当前 Agent 不支持异步流式执行");
        }
        String accessType = normalizeAccessType(agent.getAccessType());
        String asyncStartUrl;
        String httpMethod;
        String requestBody;
        if (ACCESS_HTTP_API.equals(accessType)) {
            String endpointUrl = trimToNull(agent.getEndpointUrl());
            asyncStartUrl = trimTrailingSlash(endpointUrl) + "/start";
            httpMethod = normalizeHttpMethod(agent.getHttpMethod());
            requestBody = buildAsyncHttpRequestBody(agent, input, variables, maxRuntimeSeconds);
        } else {
            asyncStartUrl = trimTrailingSlash(requireRuntimeGateway(agent)) + CODE_PROCESSING_CLI_PATH + "/start";
            httpMethod = "POST";
            requestBody = buildCliRuntimeRequestBody(agent, input, variables, maxRuntimeSeconds);
        }
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(asyncStartUrl))
                    .timeout(Duration.ofSeconds(Math.max(submitTimeoutSeconds, 5)));
            if (ACCESS_HTTP_API.equals(accessType)) {
                applyHttpHeaders(builder, agent, httpMethod);
            } else {
                applyCliRuntimeHeaders(builder, agent);
            }
            if ("GET".equals(httpMethod)) {
                builder.GET();
            } else {
                builder.method(httpMethod, HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8));
            }
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("异步执行会话启动失败，HTTP "
                        + response.statusCode() + "：" + abbreviate(response.body(), 1000));
            }
            JsonNode body = objectMapper.readTree(defaultString(response.body()));
            String sessionId = trimToNull(body.path("sessionId").asText(""));
            if (sessionId == null) {
                throw new IllegalStateException("异步执行会话启动成功但缺少 sessionId");
            }
            return new AsyncExecutionStartResult(
                    sessionId,
                    body.path("accepted").asBoolean(true),
                    trimToNull(body.path("runnerType").asText("")),
                    trimToNull(body.path("workspaceRoot").asText("")),
                    trimToNull(body.path("startedAt").asText(""))
            );
        } catch (IOException exception) {
            throw new IllegalStateException("异步执行会话启动失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("异步执行会话启动被中断", exception);
        }
    }

    /**
     * PATROL 步骤不再依赖具体 Agent，而是直接把巡检计划里的模型配置桥接到 code-processing。
     * 这里仍复用统一 runner 会话模型，保证执行中心的异步收口、心跳和日志链路保持一致。
     */
    public AsyncExecutionStartResult startPatrolAsyncExecution(String input,
                                                               Map<String, String> variables,
                                                               int submitTimeoutSeconds,
                                                               int maxRuntimeSeconds) {
        if (!hasText(codeProcessingBaseUrl)) {
            throw new IllegalArgumentException("PATROL 执行未配置 code-processing 服务地址");
        }
        String requestBody = buildPatrolRuntimeRequestBody(input, variables, maxRuntimeSeconds);
        String asyncStartUrl = trimTrailingSlash(codeProcessingBaseUrl) + CODE_PROCESSING_CLI_PATH + "/start";
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(asyncStartUrl))
                    .timeout(Duration.ofSeconds(Math.max(submitTimeoutSeconds, 5)));
            applyCliRuntimeHeaders(builder);
            HttpResponse<String> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("PATROL 异步执行会话启动失败，HTTP "
                        + response.statusCode() + "：" + abbreviate(response.body(), 1000));
            }
            JsonNode body = objectMapper.readTree(defaultString(response.body()));
            String sessionId = trimToNull(body.path("sessionId").asText(""));
            if (sessionId == null) {
                throw new IllegalStateException("PATROL 异步执行会话启动成功但缺少 sessionId");
            }
            return new AsyncExecutionStartResult(
                    sessionId,
                    body.path("accepted").asBoolean(true),
                    trimToNull(body.path("runnerType").asText("")),
                    trimToNull(body.path("workspaceRoot").asText("")),
                    trimToNull(body.path("startedAt").asText(""))
            );
        } catch (IOException exception) {
            throw new IllegalStateException("PATROL 异步执行会话启动失败", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("PATROL 异步执行会话启动被中断", exception);
        }
    }

    public CodeReviewResult reviewMergeRequest(Long agentId,
                                               GitlabApiService.GitlabMergeRequest mergeRequest,
                                               GitlabApiService.GitlabMergeRequestChanges changes,
                                               List<String> previousIssues,
                                               String reviewStrictness) {
        AgentEntity agent = requireAgent(agentId);
        validateEnabled(agent);
        if (!ACCESS_BUILT_IN.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_CODE_REVIEW.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("当前 Agent 不是可用的 GitLab AI 代码审查 Agent");
        }
        return executeBuiltinCodeReview(agent, mergeRequest, changes, previousIssues, reviewStrictness);
    }

    public void validateCodeReviewAgent(Long agentId) {
        AgentEntity agent = requireAgent(agentId);
        validateEnabled(agent);
        if (!ACCESS_BUILT_IN.equals(normalizeAccessType(agent.getAccessType()))
                || !BUILTIN_CODE_REVIEW.equals(normalizeBuiltinCode(agent.getBuiltinCode()))) {
            throw new IllegalArgumentException("所选智能体不是可用的代码审查 Agent");
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
            case ACCESS_HTTP_API -> executeHttpApiAgent(agent, input, variables);
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
            case BUILTIN_REQUIREMENT_AI_STANDARDIZE -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : "你是需求标准化助手，请将用户输入的需求描述整理为结构化的标准需求文档，使用 Markdown 格式输出。",
                    "请将以下需求描述标准化为规范文档格式，使用 Markdown 输出。\n\n" + defaultString(input)
            );
            case BUILTIN_REQUIREMENT_AI_BREAKDOWN -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : "你是需求拆解助手，请将用户输入的需求拆解为可执行的子任务列表，使用 Markdown 格式输出。",
                    "请将以下需求拆解为可执行的子任务列表，使用 Markdown 输出。\n\n" + defaultString(input)
            );
            case BUILTIN_REQUIREMENT_AI_TEST_CASES -> invokeModelAgent(
                    agent,
                    hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt() : "你是测试用例生成助手，请基于用户输入的需求生成结构化测试用例，使用 Markdown 格式输出。",
                    "请基于以下需求生成结构化测试用例，使用 Markdown 输出。\n\n" + defaultString(input)
            );
            default -> throw new IllegalArgumentException("错误的Agent配置");
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

    /**
     * 将普通文本输入包装成一份伪造的 MR 变更，复用统一的代码审查链路，
     * 这样执行中心在测试内置代码审查智能体时也能直接得到 Markdown 结果。
     */
    private String executeBuiltinCodeReviewAsMarkdown(AgentEntity agent, String input) {
        GitlabApiService.GitlabMergeRequest mergeRequest = new GitlabApiService.GitlabMergeRequest(
                0L,
                "Agent 内置代码审查",
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
                0,
                "",
                "",
                ""
        );
        GitlabApiService.GitlabMergeRequestChanges changes = new GitlabApiService.GitlabMergeRequestChanges(
                0L,
                mergeRequest.title(),
                "Agent 内置代码审查测试输入",
                List.of(new GitlabApiService.GitlabChange(
                        "sample.txt",
                        "sample.txt",
                        defaultString(input),
                        false,
                        false,
                        false
                ))
        );
        return executeBuiltinCodeReview(agent, mergeRequest, changes, List.of(), "MEDIUM").reviewMarkdown();
    }

    private CodeReviewResult executeBuiltinCodeReview(AgentEntity agent,
                                                      GitlabApiService.GitlabMergeRequest mergeRequest,
                                                      GitlabApiService.GitlabMergeRequestChanges changes,
                                                      List<String> previousIssues,
                                                      String reviewStrictness) {
        Long modelConfigId = requireAiModelConfigId(agent);
        ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(modelConfigId);
        String prompt = hasText(agent.getSystemPrompt()) ? agent.getSystemPrompt().trim() : defaultCodeReviewPrompt();
        return codeReviewClientService.reviewMergeRequest(modelConfig, prompt, mergeRequest, changes, previousIssues, reviewStrictness);
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

    private String executeHttpApiAgent(AgentEntity agent, String input, Map<String, String> variables) {
        String endpointUrl = trimToNull(agent.getEndpointUrl());
        if (endpointUrl == null) {
            throw new IllegalArgumentException("HTTP API Agent ????????");
        }
        String httpMethod = normalizeHttpMethod(agent.getHttpMethod());
        String requestBody = buildHttpRequestBody(agent, input, variables);
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(endpointUrl))
                    .timeout(Duration.ofSeconds(resolveTimeoutSeconds(agent, variables)));

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
            case RUNTIME_CODEX_CLI, RUNTIME_CLAUDE_CODE_CLI, RUNTIME_OPENCODE_CLI -> executeCliRuntime(agent, input, variables);
            default -> throw new IllegalArgumentException("Unsupported agent runtime type: " + runtimeType);
        };
    }

    /**
     * CLI Runner 统一走 code-processing 的统一入口，执行中心仍只消费既有 Markdown / JSON 结果协议。
     */
    private String executeCliRuntime(AgentEntity agent, String input, Map<String, String> variables) {
        String endpointUrl = requireRuntimeGateway(agent);
        String requestBody = buildCliRuntimeRequestBody(agent, input, variables, resolveTimeoutSeconds(agent, variables));
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(trimTrailingSlash(endpointUrl) + CODE_PROCESSING_CLI_PATH))
                    .timeout(Duration.ofSeconds(resolveTimeoutSeconds(agent, variables)));
            applyCliRuntimeHeaders(builder, agent);
            HttpResponse<String> response = httpClient.send(
                    builder.POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("CLI Runtime HTTP " + response.statusCode() + ": " + abbreviate(response.body(), 1000));
            }
            return extractHttpResponse(agent, response.body());
        } catch (IOException exception) {
            throw new IllegalStateException("CLI Runtime request failed", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("CLI Runtime request interrupted", exception);
        }
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

    private String buildHttpRequestBody(AgentEntity agent, String input, Map<String, String> variables) {
        String requestTemplate = trimToNull(agent.getHttpRequestTemplate());
        if (requestTemplate == null) {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("input", defaultString(input));
            return payload.toString();
        }
        return renderTemplate(requestTemplate, buildTemplateVariables(input, agent.getSystemPrompt(), variables));
    }

    /**
     * 异步 CLI bridge 仍沿用原有 HTTP 模板，但这里会强制补齐 step 级运行时预算，
     * 避免旧 Agent 配置里的 300 秒默认值继续把 runner 卡死。
     */
    private String buildAsyncHttpRequestBody(AgentEntity agent,
                                             String input,
                                             Map<String, String> variables,
                                             int maxRuntimeSeconds) {
        String requestBody = buildHttpRequestBody(agent, input, variables);
        try {
            JsonNode root = hasText(requestBody) ? objectMapper.readTree(requestBody) : objectMapper.createObjectNode();
            if (!root.isObject()) {
                throw new IllegalArgumentException("异步执行请求体必须是 JSON 对象");
            }
            ObjectNode payload = ((ObjectNode) root).deepCopy();
            payload.put("timeoutSeconds", Math.max(maxRuntimeSeconds, 30));
            return payload.toString();
        } catch (IOException exception) {
            throw new IllegalArgumentException("异步执行请求体不是合法 JSON", exception);
        }
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

    private void applyCliRuntimeHeaders(HttpRequest.Builder builder, AgentEntity agent) {
        applyCliRuntimeHeaders(builder);
    }

    private void applyCliRuntimeHeaders(HttpRequest.Builder builder) {
        builder.header("Accept", "application/json");
        builder.header("Content-Type", "application/json");
        // 统一 CLI Runner 只调用平台内 code-processing 服务，鉴权固定复用平台级内部服务 Token，
        // 避免每个 Agent 还要重复维护一份 Bearer 配置。
        builder.header("Authorization", internalServiceAuthenticator.authorizationHeaderValue());
    }

    private String buildCliRuntimeRequestBody(AgentEntity agent,
                                              String input,
                                              Map<String, String> variables,
                                              int timeoutSeconds) {
        String runtimeType = normalizeRuntimeType(agent.getRuntimeType());
        String cliMode = resolveCliMode(variables == null ? null : variables.get("step_code"));
        if (cliMode == null) {
            throw new IllegalArgumentException("当前步骤不支持 CLI Runtime 执行");
        }
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("runnerType", runtimeType);
        payload.put("mode", cliMode);
        payload.put("systemPrompt", defaultString(agent.getSystemPrompt()));
        payload.put("input", hasText(agent.getUserPromptTemplate())
                ? renderTemplate(agent.getUserPromptTemplate(), buildTemplateVariables(input, agent.getSystemPrompt(), variables))
                : defaultString(input));
        payload.put("timeoutSeconds", Math.max(timeoutSeconds, 30));

        ObjectNode executionNode = payload.putObject("execution");
        putText(executionNode, "taskId", variables == null ? null : variables.get("execution_task_id"));
        putText(executionNode, "runId", variables == null ? null : variables.get("execution_run_id"));
        putText(executionNode, "stepId", variables == null ? null : variables.get("step_id"));
        putText(executionNode, "stepCode", variables == null ? null : variables.get("step_code"));
        putText(executionNode, "stepName", variables == null ? null : variables.get("step_name"));
        putText(executionNode, "projectId", variables == null ? null : variables.get("project_id"));
        putText(executionNode, "projectName", variables == null ? null : variables.get("project_name"));
        putText(executionNode, "sessionKey", buildRuntimeSessionKey(agent, variables == null ? Map.of() : variables));
        putText(executionNode, "userId", variables == null ? null : variables.get("user_id"));
        putText(executionNode, "userName", variables == null ? null : variables.get("user_name"));

        if (variables != null && hasText(variables.get("development_repositories_json"))) {
            try {
                payload.set("repositories", objectMapper.readTree(variables.get("development_repositories_json")));
            } catch (IOException exception) {
                throw new IllegalArgumentException("development_repositories_json 不是合法 JSON", exception);
            }
        } else if (variables != null && hasText(variables.get("repo_http_clone_url"))) {
            payload.putArray("repositories").add(buildRepositoryNode(variables));
        }

        if (variables != null && hasText(variables.get("test_commands_json"))) {
            try {
                payload.set("testCommands", objectMapper.readTree(variables.get("test_commands_json")));
            } catch (IOException exception) {
                throw new IllegalArgumentException("test_commands_json 不是合法 JSON", exception);
            }
        }
        if (variables != null && hasText(variables.get("test_plan_json"))) {
            try {
                payload.set("testPlan", objectMapper.readTree(variables.get("test_plan_json")));
            } catch (IOException exception) {
                throw new IllegalArgumentException("test_plan_json 不是合法 JSON", exception);
            }
        }
        if (variables != null && hasText(variables.get("patrol_plan_json"))) {
            try {
                payload.set("patrolPlan", objectMapper.readTree(variables.get("patrol_plan_json")));
            } catch (IOException exception) {
                throw new IllegalArgumentException("patrol_plan_json 不是合法 JSON", exception);
            }
        }
        return payload.toString();
    }

    private String buildPatrolRuntimeRequestBody(String input,
                                                 Map<String, String> variables,
                                                 int timeoutSeconds) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("runnerType", RUNNER_PATROL_MODEL);
        payload.put("mode", "PATROL");
        payload.put("systemPrompt", "");
        payload.put("input", defaultString(input));
        payload.put("timeoutSeconds", Math.max(timeoutSeconds, 30));

        ObjectNode executionNode = payload.putObject("execution");
        putText(executionNode, "taskId", variables == null ? null : variables.get("execution_task_id"));
        putText(executionNode, "runId", variables == null ? null : variables.get("execution_run_id"));
        putText(executionNode, "stepId", variables == null ? null : variables.get("step_id"));
        putText(executionNode, "stepCode", variables == null ? null : variables.get("step_code"));
        putText(executionNode, "stepName", variables == null ? null : variables.get("step_name"));
        putText(executionNode, "projectId", variables == null ? null : variables.get("project_id"));
        putText(executionNode, "projectName", variables == null ? null : variables.get("project_name"));
        putText(executionNode, "sessionKey", variables == null ? null : variables.get("session_key"));
        putText(executionNode, "userId", variables == null ? null : variables.get("user_id"));
        putText(executionNode, "userName", variables == null ? null : variables.get("user_name"));

        if (variables == null || !hasText(variables.get("patrol_plan_json"))) {
            throw new IllegalArgumentException("PATROL 执行缺少 patrol_plan_json");
        }
        try {
            payload.set("patrolPlan", objectMapper.readTree(variables.get("patrol_plan_json")));
        } catch (IOException exception) {
            throw new IllegalArgumentException("patrol_plan_json 不是合法 JSON", exception);
        }
        return payload.toString();
    }

    private ObjectNode buildRepositoryNode(Map<String, String> variables) {
        ObjectNode repositoryNode = objectMapper.createObjectNode();
        putText(repositoryNode, "bindingId", variables.get("repo_binding_id"));
        putText(repositoryNode, "displayName", variables.get("repo_display_name"));
        putText(repositoryNode, "projectRef", variables.get("repo_project_ref"));
        putText(repositoryNode, "projectPath", variables.get("repo_project_path"));
        putText(repositoryNode, "repoUrl", variables.get("repo_http_clone_url"));
        putText(repositoryNode, "targetBranch", variables.get("repo_target_branch"));
        putText(repositoryNode, "commitSha", variables.get("repo_commit_sha"));
        putText(repositoryNode, "apiBaseUrl", variables.get("repo_api_base_url"));
        putText(repositoryNode, "authToken", variables.get("repo_access_token"));
        return repositoryNode;
    }

    private void putText(ObjectNode node, String fieldName, String value) {
        node.put(fieldName, defaultString(value));
    }

    private String resolveCliMode(String stepCode) {
        String normalized = trimToNull(stepCode);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.toUpperCase();
        return switch (normalized) {
            case "PLAN" -> "PLAN";
            case "IMPLEMENT" -> "IMPLEMENT";
            case "TEST" -> "TEST";
            case "AD_HOC_RUN" -> "AD_HOC";
            case "PATROL" -> "PATROL";
            case "CODE_CONTEXT", "DESIGN_DRAFT", "DESIGN_REVIEW" -> "TECHNICAL_DESIGN";
            default -> null;
        };
    }

    private boolean isCliRuntime(AgentEntity agent) {
        if (agent == null || !ACCESS_AGENT_RUNTIME.equals(normalizeAccessType(agent.getAccessType()))) {
            return false;
        }
        String runtimeType = trimToNull(agent.getRuntimeType());
        if (runtimeType == null) {
            return false;
        }
        String normalized = runtimeType.toUpperCase();
        return RUNTIME_CODEX_CLI.equals(normalized) || RUNTIME_CLAUDE_CODE_CLI.equals(normalized) || RUNTIME_OPENCODE_CLI.equals(normalized);
    }

    private String requireRuntimeGateway(AgentEntity agent) {
        if (codeProcessingBaseUrl != null) {
            return codeProcessingBaseUrl;
        }
        String endpointUrl = trimToNull(agent.getEndpointUrl());
        if (endpointUrl != null) {
            return endpointUrl;
        }
        throw new IllegalArgumentException("CLI Runtime 未配置 code-processing 服务地址");
    }

    private String buildRuntimeSessionKey(AgentEntity agent, Map<String, String> variables) {
        if (isCliRuntime(agent)) {
            return trimToNull(variables.get("session_key"));
        }
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
                String value = defaultString(entry.getValue());
                variables.put(entry.getKey(), value);
                // 额外运行时变量同时提供 JSON 安全版本，避免 HTTP 模板内嵌 token/URL 时把请求体拼坏。
                variables.put(entry.getKey() + "_json", toJsonString(value));
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
        String builtinCode = trimToNull(agent.getBuiltinCode());
        AgentType agentType = builtinCode != null ? AgentType.AGENT_TEST : AgentType.USER_DEFINED_AGENT;
        AgentInvocationContext ctx = AgentInvocationContext.builder(agentType)
                .action(builtinCode != null ? builtinCode : "RUN")
                .agentId(agent.getId())
                .agentCode(builtinCode)
                .modelConfig(agent.getAiModelConfig())
                .inputChars((systemPrompt == null ? 0 : systemPrompt.length()) + (userPrompt == null ? 0 : userPrompt.length()))
                .build();
        return agentInvocationRecorder.trackWithUsage(ctx, sink -> {
            ModelConfigService.ModelInvocation inv =
                    modelConfigService.invokePromptWithUsage(modelConfigId, systemPrompt, userPrompt);
            sink.setUsage(inv.promptTokens(), inv.completionTokens(), inv.totalTokens());
            sink.setOutputChars(inv.text() == null ? 0 : inv.text().length());
            return inv.text();
        });
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

    /** 编排发布的步骤超时优先于 Agent 默认值，并在任务快照恢复后继续生效。 */
    private int resolveTimeoutSeconds(AgentEntity agent, Map<String, String> variables) {
        String configured = variables == null ? null : variables.get("orchestration_timeout_seconds");
        if (configured != null) {
            try { return Math.max(10, Math.min(Integer.parseInt(configured), 7200)); }
            catch (NumberFormatException ignored) { /* 非法快照回退 Agent 默认值。 */ }
        }
        return resolveTimeoutSeconds(agent);
    }

    private String normalizeAccessType(String value) {
        String normalized = trimToNull(value);
        normalized = normalized == null ? ACCESS_BUILT_IN : normalized.toUpperCase();
        if (!ACCESS_BUILT_IN.equals(normalized)
                && !ACCESS_LLM_PROMPT.equals(normalized)
                && !ACCESS_LLM_VISION.equals(normalized)
                && !ACCESS_HTTP_API.equals(normalized)
                && !ACCESS_AGENT_RUNTIME.equals(normalized)) {
            throw new IllegalArgumentException("Agent access type must be BUILT_IN, LLM_PROMPT, LLM_VISION, HTTP_API, or AGENT_RUNTIME");
        }
        return normalized;
    }

    private String normalizeRuntimeType(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException("Agent runtime type is required");
        }
        normalized = normalized.toUpperCase();
        if (!RUNTIME_OPENCLAW.equals(normalized)
                && !RUNTIME_CODEX_CLI.equals(normalized)
                && !RUNTIME_CLAUDE_CODE_CLI.equals(normalized)
                && !RUNTIME_OPENCODE_CLI.equals(normalized)) {
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
                && !BUILTIN_REPOSITORY_SCAN_PLAN.equals(normalized)
                && !BUILTIN_REQUIREMENT_AI_STANDARDIZE.equals(normalized)
                && !BUILTIN_REQUIREMENT_AI_BREAKDOWN.equals(normalized)
                && !BUILTIN_REQUIREMENT_AI_TEST_CASES.equals(normalized)
                && !BUILTIN_IMAGE_UNDERSTANDING.equals(normalized)) {
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
                你是平台内置的 Merge Request 代码审查智能体，请基于代码变更识别高风险问题并给出中文结论。
                审查重点：
                1. 优先关注会导致线上故障、数据破坏、安全漏洞、性能退化或兼容性问题的缺陷
                2. 重点检查关键业务逻辑、边界条件、异常处理、并发、SQL 与缓存一致性等高风险场景
                3. 如果证据不足，请明确指出缺失上下文与潜在风险，不要臆测不存在的问题
                4. 结论需要能够直接支持“是否允许合并”的决策

                请只返回 JSON，格式如下：
                {"approved": true/false, "summary": "...", "issues": ["..."]}

                只要存在高风险问题，approved 必须为 false。
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

    public record AsyncExecutionStartResult(
            String sessionId,
            boolean accepted,
            String runnerType,
            String workspaceRoot,
            String startedAt
    ) {
    }
}
