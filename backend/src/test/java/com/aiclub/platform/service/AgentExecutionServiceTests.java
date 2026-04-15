package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.repository.AgentRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    private AgentExecutionService agentExecutionService;

    @BeforeEach
    void setUp() {
        agentExecutionService = new AgentExecutionService(
                agentRepository,
                tokenCipherService,
                modelConfigService,
                codeReviewClientService,
                new ObjectMapper()
        );
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
        when(modelConfigService.invokePrompt(
                eq(5L),
                contains("仓库扫描计划智能体"),
                contains("生成 AI 可执行计划")
        )).thenReturn("""
                {"summary":"AI 计划已生成","executionMarkdown":"# 计划","recommendedMode":"SEQUENTIAL","shards":[],"manualItems":[],"notes":[]}
                """);

        String output = agentExecutionService.runAgent(11L, "仓库：demo");

        assertThat(output).contains("AI 计划已生成");
        verify(modelConfigService).invokePrompt(
                eq(5L),
                contains("仓库扫描计划智能体"),
                contains("生成 AI 可执行计划")
        );
    }

    /**
     * 构造可执行的仓库扫描计划智能体样例。
     */
    private AgentEntity buildRepositoryScanPlanAgent() {
        AgentEntity agent = new AgentEntity();
        agent.setId(11L);
        agent.setName("扫描计划智能体");
        agent.setType("规划");
        agent.setCategory("技术设计");
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
}
