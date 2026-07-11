package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationProfileEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationStepBindingEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity;
import com.aiclub.platform.dto.request.UpdateExecutionOrchestrationVersionRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationProfileRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationStepBindingRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationVersionRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 使用真实 JPA SQL 顺序验证草稿完整替换，防止延迟删除与相同步骤插入发生唯一键冲突。
 */
@SpringBootTest
@Transactional
class ExecutionOrchestrationServiceIntegrationTests {

    @Autowired ExecutionOrchestrationService orchestrationService;
    @Autowired ExecutionOrchestrationProfileRepository profileRepository;
    @Autowired ExecutionOrchestrationVersionRepository versionRepository;
    @Autowired ExecutionOrchestrationStepBindingRepository stepBindingRepository;
    @Autowired AgentRepository agentRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldReplaceExistingStepBindingsBeforeInsertingSameStepCodes() {
        AuthContextHolder.set(new AuthContext(
                null, "orchestration-admin", "编排管理员", Set.of("SUPER_ADMIN"),
                Set.of("execution:orchestration:manage")
        ));

        AgentEntity agent = new AgentEntity();
        agent.setName("Codex Runtime");
        agent.setType("CUSTOM");
        agent.setStatus("ENABLED");
        agent.setEnabled(true);
        agent.setAccessType(AgentExecutionService.ACCESS_AGENT_RUNTIME);
        agent.setRuntimeType(AgentExecutionService.RUNTIME_CODEX_CLI);
        agent.setCapability("开发执行");
        agent.setDescription("用于验证编排草稿替换");
        agent = agentRepository.saveAndFlush(agent);

        ExecutionOrchestrationProfileEntity profile = new ExecutionOrchestrationProfileEntity();
        profile.setScopeType(ExecutionOrchestrationService.SCOPE_PLATFORM);
        profile.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        profile = profileRepository.saveAndFlush(profile);

        ExecutionOrchestrationVersionEntity version = new ExecutionOrchestrationVersionEntity();
        version.setProfile(profile);
        version.setVersionNo(1);
        version.setStatus("DRAFT");
        version = versionRepository.saveAndFlush(version);
        profile.setDraftVersion(version);
        profileRepository.saveAndFlush(profile);

        ExecutionOrchestrationStepBindingEntity existing = new ExecutionOrchestrationStepBindingEntity();
        existing.setVersion(version);
        existing.setStepCode(ExecutionWorkflowService.STEP_PLAN);
        existing.setAgent(agent);
        existing.setTimeoutSeconds(300);
        existing.setAgentNameSnapshot(agent.getName());
        existing.setAccessTypeSnapshot(agent.getAccessType());
        existing.setRuntimeTypeSnapshot(agent.getRuntimeType());
        stepBindingRepository.saveAndFlush(existing);

        var updated = orchestrationService.updateDraft(version.getId(),
                new UpdateExecutionOrchestrationVersionRequest(
                        version.getRevision(),
                        List.of(new UpdateExecutionOrchestrationVersionRequest.StepBinding(
                                ExecutionWorkflowService.STEP_PLAN, agent.getId(), 600
                        ))
                ));

        assertThat(updated.stepBindings()).singleElement().satisfies(binding -> {
            assertThat(binding.stepCode()).isEqualTo(ExecutionWorkflowService.STEP_PLAN);
            assertThat(binding.timeoutSeconds()).isEqualTo(600);
        });
    }
}
