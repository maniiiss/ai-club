package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGiteeBindingEntity;
import com.aiclub.platform.dto.GiteeProgramSummary;
import com.aiclub.platform.dto.IterationGiteeBindingSummary;
import com.aiclub.platform.dto.ProjectGiteeBindingSummary;
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
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
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

    @Mock
    private PlatformEnvVarResolver platformEnvVarResolver;

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
                platformEnvVarResolver,
                "https://api.gitee.com/enterprises"
        );
        lenient().when(giteeApiService.normalizeEnterpriseApiBaseUrl(anyString()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> resolveFromLegacy(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID, invocation.getArgument(1)));
        lenient().when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> resolveFromLegacy(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN, invocation.getArgument(1)));
    }

    @Test
    void shouldCreateProjectBindingAfterResolvingRemoteProgram() {
        configureGlobalBinding(99L, "plain-token");
        ProjectEntity project = buildProject(7L, "项目A");
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.empty());
        when(giteeApiService.fetchProgram("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L))
                .thenReturn(new GiteeApiService.GiteeProgram(1001L, "远端项目A", "program-a"));
        when(projectGiteeBindingRepository.save(any(ProjectGiteeBindingEntity.class))).thenAnswer(invocation -> {
            ProjectGiteeBindingEntity entity = invocation.getArgument(0);
            entity.setId(88L);
            return entity;
        });

        ProjectGiteeBindingSummary summary = giteeBindingService.createProjectBinding(
                7L,
                new ProjectGiteeBindingRequest(1001L, true)
        );

        assertThat(summary.id()).isEqualTo(88L);
        assertThat(summary.projectId()).isEqualTo(7L);
        assertThat(summary.enterpriseId()).isEqualTo(99L);
        assertThat(summary.giteeProgramId()).isEqualTo(1001L);
        assertThat(summary.giteeProgramName()).isEqualTo("远端项目A");
        assertThat(summary.enabled()).isTrue();
    }

    @Test
    void shouldReuseExistingTokenWhenUpdatingProjectBindingWithoutGlobalToken() {
        ProjectEntity project = buildProject(7L, "项目A");
        ProjectGiteeBindingEntity binding = buildProjectBinding(project);
        when(projectRepository.findById(7L)).thenReturn(Optional.of(project));
        when(projectGiteeBindingRepository.findByProject_Id(7L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(giteeApiService.fetchProgram("https://api.gitee.com/enterprises", "plain-token", 99L, 1002L))
                .thenReturn(new GiteeApiService.GiteeProgram(1002L, "远端项目B", "program-b"));
        when(projectGiteeBindingRepository.save(any(ProjectGiteeBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProjectGiteeBindingSummary result = giteeBindingService.updateProjectBinding(
                7L,
                new ProjectGiteeBindingRequest(1002L, false)
        );

        assertThat(result.giteeProgramId()).isEqualTo(1002L);
        assertThat(result.giteeProgramName()).isEqualTo("远端项目B");
        assertThat(result.enabled()).isFalse();
        verify(tokenCipherService).decrypt("cipher-token");
    }

    @Test
    void shouldNormalizeLegacyPublicApiUrlWhenListingProjectPrograms() {
        giteeBindingService = new GiteeBindingService(
                projectRepository,
                iterationRepository,
                projectGiteeBindingRepository,
                iterationGiteeBindingRepository,
                projectDataPermissionService,
                giteeApiService,
                tokenCipherService,
                platformEnvVarResolver,
                "https://gitee.com/api/v8"
        );
        configureGlobalBinding(99L, "plain-token");
        when(giteeApiService.normalizeEnterpriseApiBaseUrl("https://gitee.com/api/v8"))
                .thenReturn("https://api.gitee.com/enterprises");
        when(giteeApiService.listPrograms("https://api.gitee.com/enterprises", "plain-token", 99L))
                .thenReturn(List.of(new GiteeApiService.GiteeProgram(1001L, "远端项目A", "program-a")));

        List<GiteeProgramSummary> result = giteeBindingService.listProjectPrograms();

        assertThat(result).extracting(GiteeProgramSummary::name).containsExactly("远端项目A");
    }

    @Test
    void shouldReturnEmptyProjectProgramsWhenEnterpriseHasNoVisiblePrograms() {
        configureGlobalBinding(99L, "plain-token");
        when(giteeApiService.listPrograms("https://api.gitee.com/enterprises", "plain-token", 99L))
                .thenReturn(List.of());

        List<GiteeProgramSummary> result = giteeBindingService.listProjectPrograms();

        assertThat(result).isEmpty();
    }

    @Test
    void shouldRejectIterationBindingWhenRemoteIterationNotBelongToProgram() {
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
        when(giteeApiService.listMilestones("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L))
                .thenReturn(List.of(new GiteeApiService.GiteeMilestone(5L, "迭代A", "open", "2026-04-01", "2026-04-30")));

        assertThatThrownBy(() -> giteeBindingService.createIterationBinding(12L, new IterationGiteeBindingRequest(999L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("指定 Gitee 迭代不属于当前绑定的 Gitee 项目");
    }

    @Test
    void shouldCreateIterationBindingWhenRemoteIterationBelongsToProjectProgram() {
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
        when(giteeApiService.listMilestones("https://api.gitee.com/enterprises", "plain-token", 99L, 1001L))
                .thenReturn(List.of(new GiteeApiService.GiteeMilestone(5L, "迭代A", "open", "2026-04-01", "2026-04-30")));
        when(iterationGiteeBindingRepository.save(any())).thenAnswer(invocation -> {
            com.aiclub.platform.domain.model.IterationGiteeBindingEntity entity = invocation.getArgument(0);
            entity.setId(66L);
            return entity;
        });

        IterationGiteeBindingSummary summary = giteeBindingService.createIterationBinding(12L, new IterationGiteeBindingRequest(5L));

        assertThat(summary.id()).isEqualTo(66L);
        assertThat(summary.iterationId()).isEqualTo(12L);
        assertThat(summary.giteeMilestoneId()).isEqualTo(5L);
        assertThat(summary.giteeMilestoneTitle()).isEqualTo("迭代A");
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
        binding.setApiBaseUrl("https://api.gitee.com/enterprises");
        binding.setAccessTokenCiphertext("cipher-token");
        binding.setGiteeProgramId(1001L);
        binding.setGiteeProgramName("远端项目A");
        binding.setEnabled(true);
        return binding;
    }

    private void configureGlobalBinding(long enterpriseId, String accessToken) {
        when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new PlatformEnvVarResolver.PlatformEnvVarResolvedValue(
                        PlatformEnvVarRegistry.KEY_GITEE_BINDING_ENTERPRISE_ID,
                        String.valueOf(enterpriseId),
                        PlatformEnvVarRegistry.SOURCE_TYPE_STATIC
                ));
        when(platformEnvVarResolver.resolve(org.mockito.ArgumentMatchers.eq(PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN), org.mockito.ArgumentMatchers.any()))
                .thenReturn(new PlatformEnvVarResolver.PlatformEnvVarResolvedValue(
                        PlatformEnvVarRegistry.KEY_GITEE_BINDING_ACCESS_TOKEN,
                        accessToken,
                        PlatformEnvVarRegistry.SOURCE_TYPE_STATIC
                ));
    }

    @SuppressWarnings("unchecked")
    private PlatformEnvVarResolver.PlatformEnvVarResolvedValue resolveFromLegacy(String envKey, Object supplierArg) {
        Supplier<String> supplier = (Supplier<String>) supplierArg;
        String value = supplier == null ? null : supplier.get();
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalStateException(envKey + "未配置");
        }
        return new PlatformEnvVarResolver.PlatformEnvVarResolvedValue(
                envKey,
                value,
                PlatformEnvVarRegistry.EFFECTIVE_SOURCE_TYPE_LEGACY
        );
    }
}
