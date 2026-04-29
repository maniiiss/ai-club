package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.dto.GiteeProjectBindingDiscoveryResult;
import com.aiclub.platform.dto.IterationGiteeBindingSummary;
import com.aiclub.platform.dto.ProjectGiteeBindingSummary;
import com.aiclub.platform.dto.request.GiteeProjectBindingDiscoveryRequest;
import com.aiclub.platform.dto.request.IterationGiteeBindingRequest;
import com.aiclub.platform.dto.request.ProjectGiteeBindingRequest;
import com.aiclub.platform.repository.IterationGiteeBindingRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectGiteeBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GiteeBindingServiceTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private IterationRepository iterationRepository;

    @Mock
    private ProjectGiteeBindingRepository projectGiteeBindingRepository;

    @Mock
    private IterationGiteeBindingRepository iterationGiteeBindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private GiteeApiService giteeApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    private GiteeBindingService giteeBindingService;

    @BeforeEach
    void setUp() {
        giteeBindingService = new GiteeBindingService(
                projectRepository,
                iterationRepository,
                projectGiteeBindingRepository,
                iterationGiteeBindingRepository,
                projectDataPermissionService,
                giteeApiService,
                tokenCipherService,
                "https://gitee.com/api/v8"
        );
    }

    @Test
    void shouldCreateProjectBindingAfterResolvingRemoteProgram() {
        ProjectEntity project = buildProject(7L, "项目A");
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.empty());
        when(giteeApiService.fetchProgram("https://gitee.com/api/v8", "plain-token", 99L, 1001L))
                .thenReturn(new GiteeApiService.GiteeProgram(1001L, "远端项目A", "program-a"));
        when(projectGiteeBindingRepository.save(any(ProjectGiteeBindingEntity.class))).thenAnswer(invocation -> {
            ProjectGiteeBindingEntity entity = invocation.getArgument(0);
            entity.setId(88L);
            return entity;
        });

        ProjectGiteeBindingSummary summary = giteeBindingService.createProjectBinding(
                7L,
                new ProjectGiteeBindingRequest(99L, "https://gitee.com/api/v8", 1001L, "plain-token", true)
        );

        assertThat(summary.id()).isEqualTo(88L);
        assertThat(summary.projectId()).isEqualTo(7L);
        assertThat(summary.enterpriseId()).isEqualTo(99L);
        assertThat(summary.giteeProgramId()).isEqualTo(1001L);
        assertThat(summary.giteeProgramName()).isEqualTo("远端项目A");
        assertThat(summary.enabled()).isTrue();
    }

    @Test
    void shouldReuseExistingTokenWhenDiscoveringPrograms() {
        ProjectEntity project = buildProject(7L, "项目A");
        ProjectGiteeBindingEntity binding = buildProjectBinding(project);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listPrograms("https://gitee.com/api/v8", "plain-token", 99L))
                .thenReturn(List.of(new GiteeApiService.GiteeProgram(1001L, "远端项目A", "program-a")));
        when(projectGiteeBindingRepository.save(any(ProjectGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GiteeProjectBindingDiscoveryResult result = giteeBindingService.discoverPrograms(
                7L,
                new GiteeProjectBindingDiscoveryRequest(99L, "https://gitee.com/api/v8", "")
        );

        assertThat(result.programs()).hasSize(1);
        assertThat(result.programs().get(0).name()).isEqualTo("远端项目A");
        verify(tokenCipherService).decrypt("cipher-token");
    }

    @Test
    void shouldRejectIterationBindingWhenMilestoneNotBelongToProgram() {
        ProjectEntity project = buildProject(7L, "项目A");
        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setName("迭代A");
        iteration.setProject(project);

        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(project);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(iterationRepository.findById(12L)).thenReturn(Optional.of(iteration));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.empty());
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listMilestones("https://gitee.com/api/v8", "plain-token", 99L, 1001L))
                .thenReturn(List.of(new GiteeApiService.GiteeMilestone(5L, "里程碑A", "open", "2026-04-01", "2026-04-30")));

        assertThatThrownBy(() -> giteeBindingService.createIterationBinding(12L, new IterationGiteeBindingRequest(999L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("指定里程碑不属于当前绑定的 Gitee 项目");
    }

    @Test
    void shouldCreateIterationBindingWhenMilestoneBelongsToProjectProgram() {
        ProjectEntity project = buildProject(7L, "项目A");
        IterationEntity iteration = new IterationEntity();
        iteration.setId(12L);
        iteration.setName("迭代A");
        iteration.setProject(project);

        ProjectGiteeBindingEntity projectBinding = buildProjectBinding(project);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(iterationRepository.findById(12L)).thenReturn(Optional.of(iteration));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(projectBinding));
        when(iterationGiteeBindingRepository.findByIteration_Id(12L)).thenReturn(Optional.empty());
        when(iterationGiteeBindingRepository.existsByProject_IdAndGiteeMilestoneIdAndIdNot(7L, 5L, -1L)).thenReturn(false);
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.listMilestones("https://gitee.com/api/v8", "plain-token", 99L, 1001L))
                .thenReturn(List.of(new GiteeApiService.GiteeMilestone(5L, "里程碑A", "open", "2026-04-01", "2026-04-30")));
        when(iterationGiteeBindingRepository.save(any())).thenAnswer(invocation -> {
            com.aiclub.platform.domain.model.IterationGiteeBindingEntity entity = invocation.getArgument(0);
            entity.setId(66L);
            return entity;
        });

        IterationGiteeBindingSummary summary = giteeBindingService.createIterationBinding(12L, new IterationGiteeBindingRequest(5L));

        assertThat(summary.id()).isEqualTo(66L);
        assertThat(summary.iterationId()).isEqualTo(12L);
        assertThat(summary.giteeMilestoneId()).isEqualTo(5L);
        assertThat(summary.giteeMilestoneTitle()).isEqualTo("里程碑A");
    }

    private ProjectEntity buildProject(Long id, String name) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName(name);
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription(name + " 描述");
        return project;
    }

    private ProjectGiteeBindingEntity buildProjectBinding(ProjectEntity project) {
        ProjectGiteeBindingEntity binding = new ProjectGiteeBindingEntity();
        binding.setId(3L);
        binding.setProject(project);
        binding.setEnterpriseId(99L);
        binding.setApiBaseUrl("https://gitee.com/api/v8");
        binding.setAccessTokenCiphertext("cipher-token");
        binding.setGiteeProgramId(1001L);
        binding.setGiteeProgramName("远端项目A");
        binding.setEnabled(true);
        return binding;
    }
}
