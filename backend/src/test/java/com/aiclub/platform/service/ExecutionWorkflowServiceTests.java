package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 覆盖执行中心工作流在多仓开发场景下的动态展开与兼容恢复逻辑。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionWorkflowServiceTests {

    @Mock
    private AgentRepository agentRepository;

    private ExecutionWorkflowService executionWorkflowService;

    @BeforeEach
    void setUp() {
        executionWorkflowService = new ExecutionWorkflowService(agentRepository, new ObjectMapper());
        when(agentRepository.findAllByEnabledTrueAndProjectIsNullOrderByIdAsc()).thenReturn(List.of(
                buildAgent(1L, "规划智能体", AgentExecutionService.ACCESS_BUILT_IN),
                buildAgent(2L, "开发智能体", AgentExecutionService.ACCESS_AGENT_RUNTIME),
                buildAgent(3L, "测试智能体", AgentExecutionService.ACCESS_HTTP_API),
                buildAgent(4L, "报告智能体", AgentExecutionService.ACCESS_BUILT_IN),
                buildRuntimeAgent(5L, "Codex 技术设计", AgentExecutionService.RUNTIME_CODEX_CLI),
                buildRuntimeAgent(6L, "Claude 技术设计", AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI)
        ));
        when(agentRepository.findAllByProject_IdAndEnabledTrueOrderByIdAsc(11L)).thenReturn(List.of());
    }

    /**
     * 新版开发执行应先做仓库结构化，再按仓库顺序展开规划、逐仓开发/测试和最终报告。
     */
    @Test
    void shouldBuildDynamicDevelopmentWorkflowForMultipleRepositories() {
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                List.of(
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_PLAN, 1L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_IMPLEMENT, 2L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_TEST, 3L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_REPORT, 4L)
                ),
                List.of(
                        new ExecutionWorkflowService.DevelopmentRepositorySelection(101L, "release/1.0", "group/frontend"),
                        new ExecutionWorkflowService.DevelopmentRepositorySelection(102L, "main", "group/backend")
                )
        );

        assertThat(workflowPlan.steps())
                .extracting(
                        ExecutionWorkflowService.ExecutionStepPlan::stepNo,
                        ExecutionWorkflowService.ExecutionStepPlan::stepCode,
                        ExecutionWorkflowService.ExecutionStepPlan::stepName,
                        ExecutionWorkflowService.ExecutionStepPlan::repositoryBindingId,
                        ExecutionWorkflowService.ExecutionStepPlan::repositoryTargetBranch
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "REPO_STRUCTURING", "仓库结构化", null, null),
                        org.assertj.core.groups.Tuple.tuple(2, "PLAN", "执行规划", null, null),
                        org.assertj.core.groups.Tuple.tuple(3, "IMPLEMENT", "开发实现 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(4, "TEST", "执行测试 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(5, "IMPLEMENT", "开发实现 · group/backend", 102L, "main"),
                        org.assertj.core.groups.Tuple.tuple(6, "TEST", "执行测试 · group/backend", 102L, "main"),
                        org.assertj.core.groups.Tuple.tuple(7, "REPORT", "交付报告", null, null)
                );
        assertThat(workflowPlan.steps())
                .extracting(step -> step.agent() == null ? null : step.agent().getId())
                .containsExactly(null, 1L, 2L, 3L, 2L, 3L, 4L);
    }

    /**
     * 多仓步骤快照固化后，重试恢复应保持仓库顺序、名称与目标分支不变。
     */
    @Test
    void shouldRestoreConcreteMultiRepoWorkflowFromStoredBindings() {
        ExecutionWorkflowService.WorkflowPlan builtPlan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                List.of(
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_PLAN, 1L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_IMPLEMENT, 2L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_TEST, 3L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_REPORT, 4L)
                ),
                List.of(new ExecutionWorkflowService.DevelopmentRepositorySelection(101L, "release/1.0", "group/frontend"))
        );

        ExecutionWorkflowService.WorkflowPlan restoredPlan = executionWorkflowService.restoreWorkflow(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                executionWorkflowService.serializeBindings(builtPlan)
        );

        assertThat(restoredPlan.steps())
                .extracting(
                        ExecutionWorkflowService.ExecutionStepPlan::stepNo,
                        ExecutionWorkflowService.ExecutionStepPlan::stepCode,
                        ExecutionWorkflowService.ExecutionStepPlan::stepName,
                        ExecutionWorkflowService.ExecutionStepPlan::repositoryBindingId,
                        ExecutionWorkflowService.ExecutionStepPlan::repositoryTargetBranch
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "REPO_STRUCTURING", "仓库结构化", null, null),
                        org.assertj.core.groups.Tuple.tuple(2, "PLAN", "执行规划", null, null),
                        org.assertj.core.groups.Tuple.tuple(3, "IMPLEMENT", "开发实现 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(4, "TEST", "执行测试 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(5, "REPORT", "交付报告", null, null)
                );
    }

    @Test
    void shouldSerializeImmutableAgentIdentitySnapshot() throws Exception {
        ExecutionWorkflowService.WorkflowPlan plan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION, 11L,
                List.of(new ExecutionAgentBindingRequest("PLAN", 1L), new ExecutionAgentBindingRequest("IMPLEMENT", 2L),
                        new ExecutionAgentBindingRequest("TEST", 3L), new ExecutionAgentBindingRequest("REPORT", 4L)),
                List.of(new ExecutionWorkflowService.DevelopmentRepositorySelection(101L, "main", "group/app")));
        String payload = executionWorkflowService.serializeBindings(plan);
        plan.steps().get(2).agent().setName("后续改名");
        plan.steps().get(2).agent().setRuntimeType("CHANGED_RUNTIME");

        var implement = new ObjectMapper().readTree(payload).get(2);
        assertThat(implement.path("agentName").asText()).isEqualTo("开发智能体");
        assertThat(implement.path("accessType").asText()).isEqualTo(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        assertThat(implement.path("runtimeType").asText()).isNotEqualTo("CHANGED_RUNTIME");
    }

    /**
     * 历史开发任务仍需按旧三步语义恢复，避免重试时被误判为新版多仓流程。
     */
    @Test
    void shouldRestoreHistoricalDevelopmentWorkflowFromLegacyBindings() {
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.restoreWorkflow(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                11L,
                """
                        [
                          {"stepCode":"PLAN","agentId":1},
                          {"stepCode":"IMPLEMENT","agentId":2},
                          {"stepCode":"REVIEW","agentId":4}
                        ]
                        """
        );

        assertThat(workflowPlan.steps())
                .extracting(
                        ExecutionWorkflowService.ExecutionStepPlan::stepNo,
                        ExecutionWorkflowService.ExecutionStepPlan::stepCode,
                        ExecutionWorkflowService.ExecutionStepPlan::stepName
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "PLAN", "执行规划"),
                        org.assertj.core.groups.Tuple.tuple(2, "IMPLEMENT", "开发实现"),
                        org.assertj.core.groups.Tuple.tuple(3, "REVIEW", "质量评审")
                );
    }

    /**
     * 测试计划自动化场景首版由平台内置编排器直接执行，不依赖项目 Agent。
     */
    @Test
    void shouldBuildInternalAutomationWorkflowWithoutAgents() {
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_TEST_AUTOMATION,
                11L,
                List.of()
        );

        assertThat(workflowPlan.scenarioName()).isEqualTo("自动化测试");
        assertThat(workflowPlan.steps())
                .extracting(
                        ExecutionWorkflowService.ExecutionStepPlan::stepNo,
                        ExecutionWorkflowService.ExecutionStepPlan::stepCode,
                        ExecutionWorkflowService.ExecutionStepPlan::stepName
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "PLAN", "自动化规划"),
                        org.assertj.core.groups.Tuple.tuple(2, "IMPLEMENT", "生成脚本"),
                        org.assertj.core.groups.Tuple.tuple(3, "TEST", "执行自动化"),
                        org.assertj.core.groups.Tuple.tuple(4, "REPORT", "结果回写")
                );
        assertThat(workflowPlan.steps())
                .extracting(ExecutionWorkflowService.ExecutionStepPlan::agent)
                .containsOnlyNulls();
    }

    /**
     * 技术设计场景必须固化三个只读 Runtime 步骤，并优先推荐 Codex CLI。
     */
    @Test
    void shouldBuildTechnicalDesignWorkflowWithCliRuntimeAgents() {
        ExecutionWorkflowService.WorkflowPlan workflowPlan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                List.of()
        );

        assertThat(workflowPlan.scenarioName()).isEqualTo("技术设计生成");
        assertThat(workflowPlan.steps())
                .extracting(
                        ExecutionWorkflowService.ExecutionStepPlan::stepNo,
                        ExecutionWorkflowService.ExecutionStepPlan::stepCode,
                        ExecutionWorkflowService.ExecutionStepPlan::stepName
                )
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "CODE_CONTEXT", "代码理解"),
                        org.assertj.core.groups.Tuple.tuple(2, "DESIGN_DRAFT", "方案生成"),
                        org.assertj.core.groups.Tuple.tuple(3, "DESIGN_REVIEW", "设计自检")
                );
        assertThat(workflowPlan.steps())
                .extracting(step -> step.agent().getId())
                .containsExactly(5L, 5L, 5L);
    }

    /**
     * 用户显式绑定 Claude Code 时，恢复执行必须保留每一步的独立选择。
     */
    @Test
    void shouldRestoreTechnicalDesignWorkflowWithExplicitBindings() {
        ExecutionWorkflowService.WorkflowPlan builtPlan = executionWorkflowService.buildWorkflow(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                List.of(
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_CODE_CONTEXT, 6L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_DESIGN_DRAFT, 5L),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_DESIGN_REVIEW, 6L)
                )
        );

        ExecutionWorkflowService.WorkflowPlan restoredPlan = executionWorkflowService.restoreWorkflow(
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING,
                11L,
                executionWorkflowService.serializeBindings(builtPlan)
        );

        assertThat(restoredPlan.steps())
                .extracting(step -> step.agent().getId())
                .containsExactly(6L, 5L, 6L);
    }

    private AgentEntity buildAgent(Long id, String name, String accessType) {
        AgentEntity agent = new AgentEntity();
        agent.setId(id);
        agent.setName(name);
        agent.setType(name);
        agent.setStatus("在线");
        agent.setEnabled(true);
        agent.setAccessType(accessType);
        agent.setCapability(name);
        return agent;
    }

    private AgentEntity buildRuntimeAgent(Long id, String name, String runtimeType) {
        AgentEntity agent = buildAgent(id, name, AgentExecutionService.ACCESS_AGENT_RUNTIME);
        agent.setRuntimeType(runtimeType);
        return agent;
    }
}
