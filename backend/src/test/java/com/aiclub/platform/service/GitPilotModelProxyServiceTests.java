package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.config.GitPilotCliProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 锁定 GitPilot CLI 模型代理的 SSE 嗅探逻辑：边转发边解析 usage，
 * OpenAI 取流末 chunk 顶层 usage，Anthropic 跨 message_start/message_delta 累计。
 * 同时验证转发忠实（原样写出 data 行）。
 */
@ExtendWith(MockitoExtension.class)
class GitPilotModelProxyServiceTests {

    @Mock
    private GitPilotCliService cliService;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private GitPilotCliProperties properties;

    @Mock
    private AgentInvocationRecorder agentInvocationRecorder;

    @Mock
    private GitPilotModelCreditService cliModelCreditService;

    @Mock
    private CreditService creditService;

    private GitPilotModelProxyService service;

    @BeforeEach
    void setUp() {
        service = new GitPilotModelProxyService(cliService, modelConfigService, properties,
                new ObjectMapper(), agentInvocationRecorder, cliModelCreditService, creditService);
    }

    private record ForwardResult(GitPilotModelProxyService.UsageAccumulator usage, String forwarded) {
    }

    private ForwardResult forward(String sse, String provider) throws Exception {
        GitPilotModelProxyService.UsageAccumulator usage = service.new UsageAccumulator();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        service.forwardStreamAndSniffUsage(
                new ByteArrayInputStream(sse.getBytes(StandardCharsets.UTF_8)),
                output, provider, usage);
        return new ForwardResult(usage, output.toString(StandardCharsets.UTF_8));
    }

    @Test
    void shouldSniffOpenAiUsageFromFinalChunkAndForwardFaithfully() throws Exception {
        String sse = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n"
                + "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":120,\"completion_tokens\":45,\"total_tokens\":165}}\n\n"
                + "data: [DONE]\n\n";

        ForwardResult result = forward(sse, "OPENAI");

        assertThat(result.usage.promptTokens).isEqualTo(120);
        assertThat(result.usage.completionTokens).isEqualTo(45);
        assertThat(result.usage.totalTokens).isEqualTo(165);
        // 转发忠实：输出保留原始 data 行与 [DONE]。
        assertThat(result.forwarded).contains("\"delta\":{\"content\":\"hi\"}");
        assertThat(result.forwarded).contains("[DONE]");
    }

    @Test
    void shouldSniffAnthropicUsageAcrossMessageStartAndDelta() throws Exception {
        String sse = "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":33,\"output_tokens\":1}}}\n\n"
                + "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hi\"}}\n\n"
                + "data: {\"type\":\"message_delta\",\"usage\":{\"output_tokens\":40}}\n\n"
                + "data: [DONE]\n\n";

        ForwardResult result = forward(sse, "ANTHROPIC");

        // input 来自 message_start，output 取 message_delta 的累计值。
        assertThat(result.usage.promptTokens).isEqualTo(33);
        assertThat(result.usage.completionTokens).isEqualTo(40);
        // Anthropic 不返回 total，累加器留空，由后端 UsageSink 求和。
        assertThat(result.usage.totalTokens).isNull();
    }

    @Test
    void shouldKeepForwardingWhenUsageMissingOrUnparseable() throws Exception {
        String sse = "data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}\n\n"
                + "data: not-json\n\n"
                + "data: [DONE]\n\n";

        ForwardResult result = forward(sse, "OPENAI");

        // 未解析到 usage，token 全部为空，不影响转发。
        assertThat(result.usage.promptTokens).isNull();
        assertThat(result.usage.completionTokens).isNull();
        assertThat(result.forwarded).contains("[DONE]");
    }
}
