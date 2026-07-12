package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.repository.AgentRepository;
import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 覆盖仓库扫描计划智能体的内置能力校验与执行逻辑。
 */
@ExtendWith(MockitoExtension.class)
class AgentExecutionServiceTests {

    @Mock
    private AgentRepository agentRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private CodeReviewClientService codeReviewClientService;

    @Mock
    private InternalServiceAuthenticator internalServiceAuthenticator;

    @Mock
    private AgentInvocationRecorder agentInvocationRecorder;

    private AgentExecutionService agentExecutionService;

    @BeforeEach
    void setUp() {
        lenient().when(internalServiceAuthenticator.authorizationHeaderValue()).thenReturn("Bearer internal-token");
        lenient().when(agentInvocationRecorder.track(any(), ArgumentMatchers.<java.util.function.Supplier<Object>>any()))
                .thenAnswer(invocation -> invocation.getArgument(1, java.util.function.Supplier.class).get());
        lenient().when(agentInvocationRecorder.trackWithUsage(any(), ArgumentMatchers.<java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object>>any()))
                .thenAnswer(invocation -> {
                    java.util.function.Function<com.aiclub.platform.agentusage.UsageSink, Object> fn = invocation.getArgument(1);
                    return fn.apply(new com.aiclub.platform.agentusage.UsageSink());
                });
        agentExecutionService = buildService("http://127.0.0.1:9000");
    }

    /**
     * 合法的仓库扫描计划智能体应能通过配置校验。
     */
    @Test
    void shouldValidateRepositoryScanPlanAgent() {
        AgentEntity agent = buildRepositoryScanPlanAgent();
        when(agentRepository.findById(9L)).thenReturn(Optional.of(agent));

        agentExecutionService.validateRepositoryScanPlanAgent(9L);

        verify(agentRepository).findById(9L);
    }

    /**
     * 非仓库扫描计划智能体不允许用于扫描计划分析。
     */
    @Test
    void shouldRejectNonRepositoryScanPlanAgent() {
        AgentEntity agent = buildRepositoryScanPlanAgent();
        agent.setBuiltinCode(AgentExecutionService.BUILTIN_CODE_REVIEW);
        when(agentRepository.findById(10L)).thenReturn(Optional.of(agent));

        assertThatThrownBy(() -> agentExecutionService.validateRepositoryScanPlanAgent(10L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("所选智能体不是可用的仓库扫描计划智能体");
    }

    /**
     * 仓库扫描计划智能体执行时，应通过模型调用返回 JSON 文本。
     */
    @Test
    void shouldRunRepositoryScanPlanBuiltinAgent() {
        AgentEntity agent = buildRepositoryScanPlanAgent();
        when(agentRepository.findById(11L)).thenReturn(Optional.of(agent));
        when(modelConfigService.invokePromptWithUsage(
                eq(5L),
                contains("仓库扫描计划智能体"),
                contains("生成 AI 可执行计划")
        )).thenReturn(new ModelConfigService.ModelInvocation("""
                {"summary":"AI 计划已生成","executionMarkdown":"# 计划","recommendedMode":"SEQUENTIAL","shards":[],"manualItems":[],"notes":[]}
                """, null, null, null));

        String output = agentExecutionService.runAgent(11L, "仓库：demo");

        assertThat(output).contains("AI 计划已生成");
        verify(modelConfigService).invokePromptWithUsage(
                eq(5L),
                contains("仓库扫描计划智能体"),
                contains("生成 AI 可执行计划")
        );
    }

    /**
     * 内置代码审查智能体应将普通输入包装为伪 MR，并返回代码审查 Markdown。
     */
    @Test
    void shouldRunBuiltinCodeReviewAsMarkdown() {
        AgentEntity agent = buildCodeReviewAgent();
        ModelConfigService.ResolvedModelConfig resolvedConfig = new ModelConfigService.ResolvedModelConfig(
                6L,
                "代码审查模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.example.com",
                "gpt-test",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "sk-test"
        );
        CodeReviewResult reviewResult = new CodeReviewResult(
                false,
                "发现空指针风险",
                ModelConfigService.PROVIDER_OPENAI,
                List.of("缺少空值判断"),
                """
                        # 代码审查

                        ## 结论
                        - 发现空指针风险
                        """,
                List.of(),
                List.of()
        );
        when(agentRepository.findById(12L)).thenReturn(Optional.of(agent));
        when(modelConfigService.resolveModelConfig(6L)).thenReturn(resolvedConfig);
        when(codeReviewClientService.reviewMergeRequest(eq(resolvedConfig), anyString(), any(), any(), any(), anyString()))
                .thenReturn(reviewResult);

        String output = agentExecutionService.runAgent(12L, "新增空指针风险");

        assertThat(output).contains("代码审查").contains("空指针风险");

        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<GitlabApiService.GitlabMergeRequest> mergeRequestCaptor = ArgumentCaptor.forClass(GitlabApiService.GitlabMergeRequest.class);
        ArgumentCaptor<GitlabApiService.GitlabMergeRequestChanges> changesCaptor = ArgumentCaptor.forClass(GitlabApiService.GitlabMergeRequestChanges.class);
        ArgumentCaptor<List<String>> previousIssuesCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> strictnessCaptor = ArgumentCaptor.forClass(String.class);
        verify(codeReviewClientService).reviewMergeRequest(
                eq(resolvedConfig),
                promptCaptor.capture(),
                mergeRequestCaptor.capture(),
                changesCaptor.capture(),
                previousIssuesCaptor.capture(),
                strictnessCaptor.capture()
        );

        assertThat(promptCaptor.getValue()).contains("代码审查智能体").contains("JSON");
        assertThat(mergeRequestCaptor.getValue().title()).isEqualTo("Agent 内置代码审查");
        assertThat(changesCaptor.getValue().description()).isEqualTo("Agent 内置代码审查测试输入");
        assertThat(changesCaptor.getValue().changes()).hasSize(1);
        assertThat(changesCaptor.getValue().changes().get(0).newPath()).isEqualTo("sample.txt");
        assertThat(changesCaptor.getValue().changes().get(0).diff()).isEqualTo("新增空指针风险");
        assertThat(previousIssuesCaptor.getValue()).isEmpty();
        assertThat(strictnessCaptor.getValue()).isEqualTo("MEDIUM");
    }

    /**
     * HTTP API 模板里的运行时变量应同时支持 JSON 安全版本，避免仓库名或 token 中的特殊字符破坏请求体。
     */
    @Test
    void shouldRenderJsonEscapedRuntimeVariablesForHttpApiAgent() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/agent", exchange -> {
            byte[] requestBytes = exchange.getRequestBody().readAllBytes();
            capturedBody.append(new String(requestBytes, StandardCharsets.UTF_8));
            byte[] responseBytes = "{\"output\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            AgentEntity agent = new AgentEntity();
            agent.setId(13L);
            agent.setName("HTTP Agent");
            agent.setType("开发");
            agent.setStatus("在线");
            agent.setEnabled(true);
            agent.setAccessType(AgentExecutionService.ACCESS_HTTP_API);
            agent.setEndpointUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/agent");
            agent.setHttpMethod("POST");
            agent.setHttpRequestTemplate("""
                    {
                      "repoName": {{repo_display_name_json}},
                      "token": {{repo_access_token_json}}
                    }
                    """);
            when(agentRepository.findById(13L)).thenReturn(Optional.of(agent));

            String output = agentExecutionService.runAgent(
                    13L,
                    "忽略",
                    Map.of(
                            "repo_display_name", "group/demo\"repo",
                            "repo_access_token", "token-with-\"quotes\""
                    )
            );

            assertThat(output).isEqualTo("ok");
            assertThat(capturedBody.toString()).contains("\"repoName\": \"group/demo\\\"repo\"");
            assertThat(capturedBody.toString()).contains("\"token\": \"token-with-\\\"quotes\\\"\"");
        } finally {
            server.stop(0);
        }
    }

    /**
     * Claude 规划桥请求模板需要直接嵌入多仓 JSON 数组，不能被额外包成字符串。
     */
    @Test
    void shouldRenderRawDevelopmentRepositoriesJsonForHttpApiAgent() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/claude-plan", exchange -> {
            byte[] requestBytes = exchange.getRequestBody().readAllBytes();
            capturedBody.append(new String(requestBytes, StandardCharsets.UTF_8));
            byte[] responseBytes = "{\"output\":\"# 总体结论\\n规划已生成\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            AgentEntity agent = new AgentEntity();
            agent.setId(14L);
            agent.setName("Claude 规划 Agent");
            agent.setType("规划");
            agent.setStatus("在线");
            agent.setEnabled(true);
            agent.setAccessType(AgentExecutionService.ACCESS_HTTP_API);
            agent.setEndpointUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/claude-plan");
            agent.setHttpMethod("POST");
            agent.setHttpRequestTemplate("""
                    {
                      "input": {{input_json}},
                      "repositories": {{development_repositories_json}}
                    }
                    """);
            when(agentRepository.findById(14L)).thenReturn(Optional.of(agent));

            String output = agentExecutionService.runAgent(
                    14L,
                    "请生成执行规划",
                    Map.of(
                            "development_repositories_json",
                            """
                                    [
                                      {"displayName":"group/frontend","targetBranch":"release/1.0"},
                                      {"displayName":"group/backend","targetBranch":"main"}
                                    ]
                                    """.trim()
                    )
            );

            assertThat(output).contains("总体结论");
            assertThat(capturedBody.toString()).contains("\"repositories\": [");
            assertThat(capturedBody.toString()).contains("\"displayName\":\"group/frontend\"");
            assertThat(capturedBody.toString()).doesNotContain("\"repositories\": \"[");
        } finally {
            server.stop(0);
        }
    }

    /**
     * 异步 CLI bridge 启动时应强制覆盖请求体里的 timeoutSeconds，
     * 保证 step profile 计算出的长时预算能真正传递给 code-processing。
     */
    @Test
    void shouldInjectAsyncRuntimeTimeoutIntoStartRequestBody() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/api/code/codex-executions/start", exchange -> {
            byte[] requestBytes = exchange.getRequestBody().readAllBytes();
            capturedBody.append(new String(requestBytes, StandardCharsets.UTF_8));
            byte[] responseBytes = """
                    {"sessionId":"session-1","accepted":true,"runnerType":"CLI","workspaceRoot":"C:/workspace","startedAt":"2026-04-18T12:00:00Z"}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            AgentEntity agent = new AgentEntity();
            agent.setId(15L);
            agent.setName("Codex 异步 Agent");
            agent.setType("执行");
            agent.setStatus("在线");
            agent.setEnabled(true);
            agent.setAccessType(AgentExecutionService.ACCESS_HTTP_API);
            agent.setEndpointUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/api/code/codex-executions");
            agent.setHttpMethod("POST");
            agent.setHttpRequestTemplate("""
                    {
                      "input": {{input_json}},
                      "execution": {"stepId": {{step_id_json}}},
                      "timeoutSeconds": 300
                    }
                    """);

            AgentExecutionService.AsyncExecutionStartResult result = agentExecutionService.startAsyncExecution(
                    agent,
                    "请执行",
                    Map.of("step_id", "9", "step_code", "IMPLEMENT"),
                    15,
                    3600
            );

            assertThat(result.sessionId()).isEqualTo("session-1");
            assertThat(capturedBody.toString()).contains("\"timeoutSeconds\":3600");
            assertThat(capturedBody.toString()).contains("\"stepId\":\"9\"");
        } finally {
            server.stop(0);
        }
    }

    /**
     * 新版 CLI Runtime 应通过统一 /api/code/cli-executions 入口下发 runnerType 与 mode，
     * 避免 backend 再感知 Claude / Codex 的私有桥接路径差异。
     */
    @Test
    void shouldExecuteCliRuntimeThroughUnifiedEndpoint() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        StringBuilder capturedAuthorization = new StringBuilder();
        server.createContext("/api/code/cli-executions", exchange -> {
            byte[] requestBytes = exchange.getRequestBody().readAllBytes();
            capturedBody.append(new String(requestBytes, StandardCharsets.UTF_8));
            capturedAuthorization.append(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] responseBytes = "{\"output\":\"# 总体结论\\n执行完成\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            agentExecutionService = buildService("http://127.0.0.1:" + server.getAddress().getPort());
            AgentEntity agent = buildCliRuntimeAgent(16L, AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI,
                    null);
            when(agentRepository.findById(16L)).thenReturn(Optional.of(agent));

            String output = agentExecutionService.runAgent(
                    16L,
                    "请生成执行规划",
                    Map.of(
                            "step_code", "PLAN",
                            "step_id", "15",
                            "execution_task_id", "99",
                            "execution_run_id", "1001",
                            "project_id", "11",
                            "project_name", "执行中心项目",
                            "development_repositories_json",
                            """
                                    [{"displayName":"group/frontend","repoUrl":"http://gitlab/group/frontend.git","targetBranch":"main"}]
                                    """.trim()
                    )
            );

            assertThat(output).contains("总体结论");
            assertThat(capturedBody.toString()).contains("\"runnerType\":\"CLAUDE_CODE_CLI\"");
            assertThat(capturedBody.toString()).contains("\"mode\":\"PLAN\"");
            assertThat(capturedBody.toString()).contains("\"repositories\":[");
            assertThat(capturedAuthorization.toString()).isEqualTo("Bearer internal-token");
        } finally {
            server.stop(0);
        }
    }

    /**
     * AGENT_RUNTIME + CLI Runner 也应被识别为可异步执行能力，
     * 并把 stepCode 映射为统一的 CLI mode 后发往 /start 接口。
     */
    @Test
    void shouldStartAsyncCliRuntimeThroughUnifiedEndpoint() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/api/code/cli-executions/start", exchange -> {
            byte[] requestBytes = exchange.getRequestBody().readAllBytes();
            capturedBody.append(new String(requestBytes, StandardCharsets.UTF_8));
            byte[] responseBytes = """
                    {"sessionId":"cli-session-1","accepted":true,"runnerType":"CLI","workspaceRoot":"C:/workspace","startedAt":"2026-04-18T12:00:00Z"}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            agentExecutionService = buildService("http://127.0.0.1:" + server.getAddress().getPort());
            AgentEntity agent = buildCliRuntimeAgent(17L, AgentExecutionService.RUNTIME_CODEX_CLI,
                    null);

            assertThat(agentExecutionService.supportsAsyncExecution(agent, "AD_HOC_RUN")).isTrue();
            AgentExecutionService.AsyncExecutionStartResult result = agentExecutionService.startAsyncExecution(
                    agent,
                    "请执行一次兼容单次运行",
                    Map.of(
                            "step_code", "AD_HOC_RUN",
                            "step_id", "16",
                            "execution_task_id", "99",
                            "execution_run_id", "1001"
                    ),
                    15,
                    600
            );

            assertThat(result.sessionId()).isEqualTo("cli-session-1");
            assertThat(capturedBody.toString()).contains("\"runnerType\":\"CODEX_CLI\"");
            assertThat(capturedBody.toString()).contains("\"mode\":\"AD_HOC\"");
            assertThat(capturedBody.toString()).contains("\"timeoutSeconds\":600");
        } finally {
            server.stop(0);
        }
    }

    /**
     * 技术设计三个步骤统一进入只读 TECHNICAL_DESIGN 模式，由 stepCode 决定具体 Prompt。
     */
    @Test
    void shouldMapTechnicalDesignStepsToReadOnlyCliMode() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        StringBuilder capturedBody = new StringBuilder();
        server.createContext("/api/code/cli-executions/start", exchange -> {
            capturedBody.append(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] responseBytes = """
                    {"sessionId":"design-session-1","accepted":true,"runnerType":"CLI","workspaceRoot":"C:/workspace","startedAt":"2026-07-11T12:00:00Z"}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            agentExecutionService = buildService("http://127.0.0.1:" + server.getAddress().getPort());
            AgentEntity agent = buildCliRuntimeAgent(18L, AgentExecutionService.RUNTIME_CODEX_CLI, null);

            assertThat(agentExecutionService.supportsAsyncExecution(agent, ExecutionWorkflowService.STEP_CODE_CONTEXT)).isTrue();
            agentExecutionService.startAsyncExecution(
                    agent,
                    "请理解代码上下文",
                    Map.of(
                            "step_code", ExecutionWorkflowService.STEP_CODE_CONTEXT,
                            "step_id", "17",
                            "execution_task_id", "100",
                            "execution_run_id", "1002"
                    ),
                    15,
                    600
            );

            assertThat(capturedBody.toString()).contains("\"mode\":\"TECHNICAL_DESIGN\"");
            assertThat(capturedBody.toString()).contains("\"stepCode\":\"CODE_CONTEXT\"");
        } finally {
            server.stop(0);
        }
    }

    /** 图片理解能力通过稳定 builtinCode 定位，并统一记录 vision 模型 usage。 */
    @Test
    void shouldResolveAndRunImageUnderstandingAgent() {
        AgentEntity agent = new AgentEntity();
        agent.setId(30L);
        agent.setName("图片理解助手");
        agent.setType("视觉");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_LLM_VISION);
        agent.setBuiltinCode(AgentExecutionService.BUILTIN_IMAGE_UNDERSTANDING);
        agent.setSystemPrompt("按序号描述图片");
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(8L);
        modelConfig.setName("视觉模型");
        modelConfig.setModelType(ModelConfigService.MODEL_TYPE_CHAT);
        agent.setAiModelConfig(modelConfig);
        ModelConfigService.ResolvedModelConfig resolved = new ModelConfigService.ResolvedModelConfig(
                8L, "视觉模型", ModelConfigService.MODEL_TYPE_CHAT, ModelConfigService.PROVIDER_OPENAI,
                "https://api.example.com", "vision-model", ModelConfigService.OPENAI_API_MODE_AUTO, "key");
        List<ModelConfigService.VisionImage> images = List.of(
                new ModelConfigService.VisionImage(1, "image/png", "YWJj", "screen.png"));

        when(agentRepository.findFirstByBuiltinCodeAndEnabledTrueOrderByIdAsc(AgentExecutionService.BUILTIN_IMAGE_UNDERSTANDING))
                .thenReturn(Optional.of(agent));
        when(modelConfigService.resolveModelConfig(8L)).thenReturn(resolved);
        when(modelConfigService.invokeVisionPromptWithUsage(eq(resolved), eq("按序号描述图片"), eq("描述界面"), eq(images), eq(1500)))
                .thenReturn(new ModelConfigService.ModelInvocation("{\"images\":[]}", 10, 5, 15));

        AgentEntity resolvedAgent = agentExecutionService.resolveImageUnderstandingAgent().orElseThrow();
        String output = agentExecutionService.runVisionAgent(resolvedAgent, images, "描述界面");

        assertThat(output).isEqualTo("{\"images\":[]}");
        verify(modelConfigService).invokeVisionPromptWithUsage(resolved, "按序号描述图片", "描述界面", images, 1500);
    }

    /**
     * 构造可执行的仓库扫描计划智能体样例。
     */
    private AgentEntity buildRepositoryScanPlanAgent() {
        AgentEntity agent = new AgentEntity();
        agent.setId(11L);
        agent.setName("扫描计划智能体");
        agent.setType("规划");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_BUILT_IN);
        agent.setBuiltinCode(AgentExecutionService.BUILTIN_REPOSITORY_SCAN_PLAN);
        agent.setCapability("根据扫描报告生成 executable plan");
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(5L);
        agent.setAiModelConfig(modelConfig);
        return agent;
    }

    /**
     * 构造可执行的内置代码审查智能体样例。
     */
    private AgentEntity buildCodeReviewAgent() {
        AgentEntity agent = new AgentEntity();
        agent.setId(12L);
        agent.setName("代码审查智能体");
        agent.setType("审查");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_BUILT_IN);
        agent.setBuiltinCode(AgentExecutionService.BUILTIN_CODE_REVIEW);
        agent.setCapability("根据代码变更输出审查结论");
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(6L);
        agent.setAiModelConfig(modelConfig);
        return agent;
    }

    private AgentEntity buildCliRuntimeAgent(Long id, String runtimeType, String endpointBaseUrl) {
        AgentEntity agent = new AgentEntity();
        agent.setId(id);
        agent.setName("CLI Runtime Agent");
        agent.setType("执行");
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        agent.setRuntimeType(runtimeType);
        agent.setEndpointUrl(endpointBaseUrl);
        agent.setTimeoutSeconds(120);
        return agent;
    }

    private AgentExecutionService buildService(String codeProcessingBaseUrl) {
        return new AgentExecutionService(
                agentRepository,
                tokenCipherService,
                modelConfigService,
                codeReviewClientService,
                new ObjectMapper(),
                internalServiceAuthenticator,
                agentInvocationRecorder,
                codeProcessingBaseUrl
        );
    }
}
