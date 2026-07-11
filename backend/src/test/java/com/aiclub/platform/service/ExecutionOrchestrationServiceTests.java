package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationProfileEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationStepBindingEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.request.UpdateExecutionOrchestrationVersionRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationProfileRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationStepBindingRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.inOrder;

/**
 * 执行编排领域测试，锁定项目覆盖优先级、平台回退和失效配置的失败语义。
 */
@ExtendWith(MockitoExtension.class)
class ExecutionOrchestrationServiceTests {

    @Mock ExecutionOrchestrationProfileRepository profileRepository;
    @Mock ExecutionOrchestrationVersionRepository versionRepository;
    @Mock ExecutionOrchestrationStepBindingRepository stepBindingRepository;
    @Mock AgentRepository agentRepository;
    @Mock ProjectDataPermissionService projectDataPermissionService;
    @Mock ProjectRepository projectRepository;
    @Mock UserRepository userRepository;

    @Test
    void shouldPreferPublishedProjectOrchestrationAndReturnLogicalBindings() {
        ExecutionOrchestrationService service = service();
        ProjectEntity project = project(11L);
        ExecutionOrchestrationProfileEntity projectProfile = profile(1L, "PROJECT", project);
        ExecutionOrchestrationVersionEntity version = version(21L, projectProfile, "PUBLISHED");
        projectProfile.setPublishedVersion(version);
        AgentEntity agent = agent(31L, project, "AGENT_RUNTIME", "CODEX_CLI");
        List<ExecutionOrchestrationStepBindingEntity> bindings = List.of(
                binding(version, "PLAN", agent), binding(version, "IMPLEMENT", agent),
                binding(version, "TEST", agent), binding(version, "REPORT", agent));

        when(profileRepository.findByScopeTypeAndProject_IdAndScenarioCode("PROJECT", 11L,
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION)).thenReturn(Optional.of(projectProfile));
        when(stepBindingRepository.findAllByVersion_IdOrderByIdAsc(21L)).thenReturn(bindings);
        when(agentRepository.findById(31L)).thenReturn(Optional.of(agent));

        ExecutionOrchestrationService.ResolvedOrchestration resolved = service.resolve(
                11L, ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);

        assertThat(resolved.versionId()).isEqualTo(21L);
        assertThat(resolved.agentBindings()).extracting(item -> item.stepCode() + ":" + item.agentId())
                .containsExactly("PLAN:31", "IMPLEMENT:31", "TEST:31", "REPORT:31");
        assertThat(resolved.agentBindings().get(0).timeoutSeconds()).isEqualTo(600);
    }

    @Test
    void shouldFailWithStableCodeWhenNoPublishedOrchestrationExists() {
        ExecutionOrchestrationService service = service();
        when(profileRepository.findByScopeTypeAndProject_IdAndScenarioCode("PROJECT", 11L,
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING)).thenReturn(Optional.empty());
        when(profileRepository.findByScopeTypeAndScenarioCode("PLATFORM",
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.resolve(11L, ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING))
                .isInstanceOf(ExecutionOrchestrationNotReadyException.class)
                .hasMessageContaining("ORCHESTRATION_NOT_READY");
    }

    @Test
    void shouldReportScenarioNotReadyWhenPublishedAgentIsDisabled() {
        ExecutionOrchestrationService service = service();
        ExecutionOrchestrationProfileEntity platform = profile(8L, "PLATFORM", null);
        ExecutionOrchestrationVersionEntity version = version(9L, platform, "PUBLISHED");
        platform.setPublishedVersion(version);
        AgentEntity disabled = agent(31L, null, "AGENT_RUNTIME", "CODEX_CLI");
        disabled.setEnabled(false);
        List<ExecutionOrchestrationStepBindingEntity> bindings = List.of(
                binding(version, "PLAN", disabled), binding(version, "IMPLEMENT", disabled),
                binding(version, "TEST", disabled), binding(version, "REPORT", disabled));
        when(profileRepository.findByScopeTypeAndScenarioCode("PLATFORM",
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION)).thenReturn(Optional.of(platform));
        when(profileRepository.findByScopeTypeAndScenarioCode("PLATFORM",
                ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING)).thenReturn(Optional.empty());
        when(stepBindingRepository.findAllByVersion_IdOrderByIdAsc(9L)).thenReturn(bindings);
        when(agentRepository.findById(31L)).thenReturn(Optional.of(disabled));

        var development = service.listScenarios(null).stream()
                .filter(item -> item.scenarioCode().equals(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION))
                .findFirst().orElseThrow();
        assertThat(development.effectiveReady()).isFalse();
        assertThat(development.effectiveInvalidReason()).contains("Agent 已停用");
    }

    @Test
    void shouldRejectArchivedPlatformVersionAsExplicitProjectDraftSource() {
        AuthContextHolder.set(new AuthContext(1L, "admin", "管理员", Set.of(), Set.of("execution:orchestration:manage")));
        try {
            ExecutionOrchestrationService service = fullService();
            ProjectEntity project = project(11L);
            ExecutionOrchestrationProfileEntity target = profile(1L, "PROJECT", project);
            ExecutionOrchestrationProfileEntity platform = profile(2L, "PLATFORM", null);
            ExecutionOrchestrationVersionEntity archived = version(20L, platform, "ARCHIVED");
            when(profileRepository.findById(1L)).thenReturn(Optional.of(target));
            when(versionRepository.findById(20L)).thenReturn(Optional.of(archived));

            assertThatThrownBy(() -> service.createDraft(1L, 20L))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("当前发布版本");
        } finally {
            AuthContextHolder.clear();
        }
    }

    @Test
    void shouldExposeProjectAgentAsInvalidInPlatformVersionHistory() {
        AuthContextHolder.set(new AuthContext(1L, "admin", "管理员", Set.of(), Set.of("execution:orchestration:manage")));
        try {
            ExecutionOrchestrationService service = fullService();
            ExecutionOrchestrationProfileEntity platform = profile(2L, "PLATFORM", null);
            ExecutionOrchestrationVersionEntity version = version(20L, platform, "ARCHIVED");
            AgentEntity projectAgent = agent(31L, project(11L), "AGENT_RUNTIME", "CODEX_CLI");
            when(profileRepository.findAllByScopeTypeOrderByScenarioCodeAsc("PLATFORM")).thenReturn(List.of(platform));
            when(profileRepository.save(org.mockito.ArgumentMatchers.any())).thenAnswer(invocation -> invocation.getArgument(0));
            when(versionRepository.findAllByProfile_IdOrderByVersionNoDesc(2L)).thenReturn(List.of(version));
            when(stepBindingRepository.findAllByVersion_IdOrderByIdAsc(20L))
                    .thenReturn(List.of(binding(version, "IMPLEMENT", projectAgent)));

            var profileSummary = service.listProfiles("PLATFORM", null).stream()
                    .filter(item -> item.id().equals(2L)).findFirst().orElseThrow();
            assertThat(profileSummary.versions().get(0).stepBindings().get(0).valid()).isFalse();
            assertThat(profileSummary.versions().get(0).stepBindings().get(0).invalidReason())
                    .contains("平台编排只能绑定平台级 Agent");
        } finally {
            AuthContextHolder.clear();
        }
    }

    @Test
    void shouldFlushDeletedBindingsBeforeInsertingReplacementWithSameStepCode() {
        AuthContextHolder.set(new AuthContext(1L, "admin", "管理员", Set.of(), Set.of("execution:orchestration:manage")));
        try {
            ExecutionOrchestrationService service = fullService();
            ExecutionOrchestrationProfileEntity profile = profile(1L, "PLATFORM", null);
            ExecutionOrchestrationVersionEntity version = version(20L, profile, "DRAFT");
            AgentEntity agent = agent(31L, null, "AGENT_RUNTIME", "CODEX_CLI");
            when(versionRepository.findById(20L)).thenReturn(Optional.of(version));
            when(agentRepository.findById(31L)).thenReturn(Optional.of(agent));
            when(stepBindingRepository.save(org.mockito.ArgumentMatchers.any())).thenAnswer(invocation -> invocation.getArgument(0));
            when(versionRepository.saveAndFlush(version)).thenReturn(version);
            when(stepBindingRepository.findAllByVersion_IdOrderByIdAsc(20L)).thenReturn(List.of());

            service.updateDraft(20L, new UpdateExecutionOrchestrationVersionRequest(
                    0L,
                    List.of(new UpdateExecutionOrchestrationVersionRequest.StepBinding("PLAN", 31L, 600))
            ));

            InOrder sqlOrder = inOrder(stepBindingRepository);
            sqlOrder.verify(stepBindingRepository).deleteAllByVersion_Id(20L);
            sqlOrder.verify(stepBindingRepository).flush();
            sqlOrder.verify(stepBindingRepository).save(org.mockito.ArgumentMatchers.any());
        } finally {
            AuthContextHolder.clear();
        }
    }

    private ExecutionOrchestrationService service() {
        return new ExecutionOrchestrationService(profileRepository, versionRepository, stepBindingRepository,
                agentRepository, projectDataPermissionService);
    }

    private ExecutionOrchestrationService fullService() {
        return new ExecutionOrchestrationService(profileRepository, versionRepository, stepBindingRepository,
                agentRepository, projectDataPermissionService, projectRepository, userRepository);
    }

    private ProjectEntity project(Long id) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        return project;
    }

    private ExecutionOrchestrationProfileEntity profile(Long id, String scopeType, ProjectEntity project) {
        ExecutionOrchestrationProfileEntity entity = new ExecutionOrchestrationProfileEntity();
        entity.setId(id);
        entity.setScopeType(scopeType);
        entity.setProject(project);
        entity.setScenarioCode(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION);
        return entity;
    }

    private ExecutionOrchestrationVersionEntity version(Long id, ExecutionOrchestrationProfileEntity profile, String status) {
        ExecutionOrchestrationVersionEntity entity = new ExecutionOrchestrationVersionEntity();
        entity.setId(id);
        entity.setProfile(profile);
        entity.setStatus(status);
        return entity;
    }

    private AgentEntity agent(Long id, ProjectEntity project, String accessType, String runtimeType) {
        AgentEntity entity = new AgentEntity();
        entity.setId(id);
        entity.setProject(project);
        entity.setEnabled(true);
        entity.setAccessType(accessType);
        entity.setRuntimeType(runtimeType);
        return entity;
    }

    private ExecutionOrchestrationStepBindingEntity binding(ExecutionOrchestrationVersionEntity version,
                                                             String stepCode,
                                                             AgentEntity agent) {
        ExecutionOrchestrationStepBindingEntity entity = new ExecutionOrchestrationStepBindingEntity();
        entity.setVersion(version);
        entity.setStepCode(stepCode);
        entity.setAgent(agent);
        return entity;
    }
}
