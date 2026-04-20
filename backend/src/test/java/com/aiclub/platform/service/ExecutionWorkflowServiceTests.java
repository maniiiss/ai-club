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
                buildAgent(4L, "报告智能体", AgentExecutionService.ACCESS_BUILT_IN)
        ));
        when(agentRepository.findAllByProject_IdAndEnabledTrueOrderByIdAsc(11L)).thenReturn(List.of());
    }

    /**
     * 新版开发执行应按仓库顺序展开为规划、逐仓开发/测试、最终报告。
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
                        org.assertj.core.groups.Tuple.tuple(1, "PLAN", "执行规划", null, null),
                        org.assertj.core.groups.Tuple.tuple(2, "IMPLEMENT", "开发实现 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(3, "TEST", "执行测试 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(4, "IMPLEMENT", "开发实现 · group/backend", 102L, "main"),
                        org.assertj.core.groups.Tuple.tuple(5, "TEST", "执行测试 · group/backend", 102L, "main"),
                        org.assertj.core.groups.Tuple.tuple(6, "REPORT", "交付报告", null, null)
                );
        assertThat(workflowPlan.steps())
                .extracting(step -> step.agent().getId())
                .containsExactly(1L, 2L, 3L, 2L, 3L, 4L);
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
                        org.assertj.core.groups.Tuple.tuple(1, "PLAN", "执行规划", null, null),
                        org.assertj.core.groups.Tuple.tuple(2, "IMPLEMENT", "开发实现 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(3, "TEST", "执行测试 · group/frontend", 101L, "release/1.0"),
                        org.assertj.core.groups.Tuple.tuple(4, "REPORT", "交付报告", null, null)
                );
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
}
