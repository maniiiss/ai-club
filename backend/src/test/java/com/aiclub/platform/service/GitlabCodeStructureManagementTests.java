package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.GitlabCodeStructureSnapshotEntity;
import com.aiclub.platform.dto.GitlabCodeStructureQueryResult;
import com.aiclub.platform.dto.GitlabCodeStructureRefreshAcceptedResult;
import com.aiclub.platform.dto.GitlabCodeStructureSnapshotSummary;
import com.aiclub.platform.dto.request.GitlabCodeStructureQueryRequest;
import com.aiclub.platform.dto.request.GitlabCodeStructureRefreshRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergePipelineTargetRepository;
import com.aiclub.platform.repository.GitlabAutoMergeProjectShareRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabProductBranchRepository;
import com.aiclub.platform.repository.GitlabProductBranchSyncLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 GitLab 仓库代码结构快照的查询、刷新和局部搜索主链路。
 */
@ExtendWith(MockitoExtension.class)
class GitlabCodeStructureManagementTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectGitlabBindingRepository bindingRepository;

    @Mock
    private GitlabCodeStructureSnapshotRepository codeStructureSnapshotRepository;

    @Mock
    private GitlabAutoMergeConfigRepository autoMergeConfigRepository;

    @Mock
    private GitlabAutoMergeLogRepository autoMergeLogRepository;

    @Mock
    private GitlabAutoMergePipelineTargetRepository autoMergePipelineTargetRepository;

    @Mock
    private GitlabAutoMergeProjectShareRepository autoMergeProjectShareRepository;

    @Mock
    private GitlabAutoMergeWebhookRepository autoMergeWebhookRepository;

    @Mock
    private AiClubPipelineRepository aiClubPipelineRepository;

    @Mock
    private ProjectPipelineBindingRepository projectPipelineBindingRepository;

    @Mock
    private GitlabProductBranchRepository productBranchRepository;

    @Mock
    private GitlabProductBranchSyncLogRepository productBranchSyncLogRepository;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private AgentRepository agentRepository;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private CodeReviewClientService codeReviewClientService;

    @Mock
    private AgentExecutionService agentExecutionService;

    @Mock
    private CicdManagementService cicdManagementService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private GitlabAutoMergeWebhookDispatcher autoMergeWebhookDispatcher;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private GitlabUserOauthService gitlabUserOauthService;

    @Mock
    private ExecutionTaskService executionTaskService;

    @Mock
    private RepositoryScanClientService repositoryScanClientService;

    @Mock
    private RepositoryScanRulesetService repositoryScanRulesetService;

    @Mock
    private GitlabCodeStructureClientService gitlabCodeStructureClientService;

    @Mock
    private GitnexusProperties gitnexusProperties;

    @Mock
    private PlatformEnvVarResolver platformEnvVarResolver;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Mock
    private Executor executionTaskExecutor;

    private GitlabManagementService gitlabManagementService;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(platformEnvVarResolver.resolveOrDefault(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString()
        )).thenAnswer(invocation -> invocation.getArgument(2));
        gitlabManagementService = new GitlabManagementService(
                projectRepository,
                bindingRepository,
                codeStructureSnapshotRepository,
                autoMergeConfigRepository,
                autoMergePipelineTargetRepository,
                autoMergeLogRepository,
                autoMergeProjectShareRepository,
                autoMergeWebhookRepository,
                aiClubPipelineRepository,
                projectPipelineBindingRepository,
                productBranchRepository,
                productBranchSyncLogRepository,
                aiModelConfigRepository,
                agentRepository,
                gitlabApiService,
                tokenCipherService,
                modelConfigService,
                codeReviewClientService,
                agentExecutionService,
                cicdManagementService,
                notificationService,
                autoMergeWebhookDispatcher,
                projectDataPermissionService,
                gitlabUserOauthService,
                executionTaskService,
                repositoryScanClientService,
                repositoryScanRulesetService,
                gitlabCodeStructureClientService,
                gitnexusProperties,
                platformEnvVarResolver,
                new ObjectMapper(),
                "http://gitlab.example.com/api/v4",
                "",
                transactionManager,
                executionTaskExecutor
        );
    }

    @Test
    void shouldReturnNotBuiltSnapshotWhenNoCodeStructureSnapshotExists() {
        ProjectGitlabBindingEntity binding = buildBinding(true, true);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(codeStructureSnapshotRepository.findByBinding_IdAndBranchName(1L, "release/1.0")).thenReturn(Optional.empty());

        GitlabCodeStructureSnapshotSummary summary = gitlabManagementService.getBindingCodeStructure(1L, null);

        assertThat(summary.status()).isEqualTo("NOT_BUILT");
        assertThat(summary.branchName()).isEqualTo("release/1.0");
        assertThat(summary.graphNodes()).isEmpty();
    }

    @Test
    void shouldQueueBackgroundRefreshWhenSnapshotNeedsBuild() {
        ProjectGitlabBindingEntity binding = buildBinding(true, true);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(codeStructureSnapshotRepository.findByBinding_IdAndBranchName(1L, "release/1.0")).thenReturn(Optional.empty());
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        doAnswer(invocation -> {
            GitlabCodeStructureSnapshotEntity snapshot = invocation.getArgument(0);
            if (snapshot.getId() == null) {
                snapshot.setId(88L);
            }
            return snapshot;
        }).when(codeStructureSnapshotRepository).save(any(GitlabCodeStructureSnapshotEntity.class));

        GitlabCodeStructureRefreshAcceptedResult result = gitlabManagementService.refreshBindingCodeStructure(
                1L,
                new GitlabCodeStructureRefreshRequest(null)
        );

        assertThat(result.accepted()).isTrue();
        assertThat(result.status()).isEqualTo("BUILDING");
        assertThat(result.branchName()).isEqualTo("release/1.0");
        verify(executionTaskExecutor).execute(any(Runnable.class));
    }

    @Test
    void shouldRejectRefreshWhenBindingIsDisabled() {
        ProjectGitlabBindingEntity binding = buildBinding(false, true);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabManagementService.refreshBindingCodeStructure(
                1L,
                new GitlabCodeStructureRefreshRequest("release/1.0")
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前 GitLab 绑定已停用，不能刷新代码结构");
    }

    @Test
    void shouldReturnQueryResultFromCodeStructureClient() {
        ProjectGitlabBindingEntity binding = buildBinding(true, true);
        GitlabCodeStructureSnapshotEntity snapshot = new GitlabCodeStructureSnapshotEntity();
        snapshot.setId(100L);
        snapshot.setBinding(binding);
        snapshot.setBranchName("release/1.0");
        snapshot.setStatus("READY");
        snapshot.setOverviewJson("{\"overviewCards\":[]}");
        snapshot.setGraphJson("{\"nodes\":[]}");
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(codeStructureSnapshotRepository.findByBinding_IdAndBranchName(1L, "release/1.0")).thenReturn(Optional.of(snapshot));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabCodeStructureClientService.queryStructure(any()))
                .thenReturn(new GitlabCodeStructureClientService.QueryStructureResponse(
                        "release/1.0",
                        "abcdef123456",
                        false,
                        false,
                        """
                                {
                                  "hitSymbols": [
                                    {"uid":"Method:demo:createBindingScanTask","name":"createBindingScanTask","filePath":"backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java","startLine":279,"endLine":279,"symbolKind":"METHOD"}
                                  ],
                                  "hitProcesses": [],
                                  "truncated": false
                                }
                                """,
                        """
                                {
                                  "nodes": [
                                    {"id":"Method:demo:createBindingScanTask","nodeType":"METHOD","label":"createBindingScanTask","secondaryLabel":"GitlabManagementService.java","detailText":"backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java","filePath":"backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java","symbolUid":"Method:demo:createBindingScanTask","startLine":279,"endLine":279,"metadataJson":"{}"}
                                  ],
                                  "edges": []
                                }
                                """,
                        ""
                ));

        GitlabCodeStructureQueryResult result = gitlabManagementService.queryBindingCodeStructure(
                1L,
                new GitlabCodeStructureQueryRequest("release/1.0", "createBindingScanTask")
        );

        assertThat(result.branchName()).isEqualTo("release/1.0");
        assertThat(result.hitSymbols()).hasSize(1);
        assertThat(result.graphNodes()).hasSize(1);
        assertThat(result.hitSymbols().get(0).name()).isEqualTo("createBindingScanTask");
    }

    @Test
    void shouldBuildGitnexusLaunchUrlFromConfiguredPublicBaseUrls() {
        ProjectGitlabBindingEntity binding = buildBinding(true, true);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitnexusProperties.isEnabled()).thenReturn(true);
        when(gitnexusProperties.resolveUiPublicBaseUrl("https", "example.com")).thenReturn("https://gitnexus-ui.example.com");
        when(gitnexusProperties.resolveServePublicBaseUrl("https", "example.com")).thenReturn("https://gitnexus-serve.example.com");
        when(gitlabCodeStructureClientService.buildLaunchContext(any()))
                .thenReturn(new GitlabCodeStructureClientService.LaunchContextResponse(
                        "git-ai-club",
                        "release/1.0",
                        "abcdef123456",
                        true
                ));

        var result = gitlabManagementService.launchBindingGitnexus(
                1L,
                new com.aiclub.platform.dto.request.GitlabGitnexusLaunchRequest(null),
                "https",
                "example.com"
        );

        assertThat(result.repoAlias()).isEqualTo("git-ai-club");
        assertThat(result.gitnexusUiUrl()).isEqualTo("https://gitnexus-ui.example.com");
        assertThat(result.gitnexusServerUrl()).isEqualTo("https://gitnexus-serve.example.com");
        assertThat(result.launchUrl()).contains("project=git-ai-club");
        assertThat(result.launchUrl()).contains("server=https%3A%2F%2Fgitnexus-serve.example.com");
        assertThat(result.serveReady()).isTrue();
    }

    @Test
    void shouldRejectGitnexusLaunchWhenBindingTokenIsMissing() {
        ProjectGitlabBindingEntity binding = buildBinding(true, false);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(gitnexusProperties.isEnabled()).thenReturn(true);

        assertThatThrownBy(() -> gitlabManagementService.launchBindingGitnexus(
                1L,
                new com.aiclub.platform.dto.request.GitlabGitnexusLaunchRequest("release/1.0"),
                "https",
                "example.com"
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前 GitLab 绑定未配置 Token，不能刷新代码结构");
    }

    private ProjectGitlabBindingEntity buildBinding(boolean enabled, boolean tokenConfigured) {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于测试代码结构");
        project.setId(11L);
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/demo-repo");
        binding.setGitlabProjectPath("group/demo-repo");
        binding.setGitlabProjectName("demo-repo");
        binding.setDefaultTargetBranch("release/1.0");
        binding.setGitlabHttpCloneUrl("http://gitlab.example.com/group/demo-repo.git");
        binding.setEnabled(enabled);
        binding.setUpdatedAt(LocalDateTime.now());
        binding.setCreatedAt(LocalDateTime.now());
        binding.setTokenCiphertext(tokenConfigured ? "cipher-token" : "");
        return binding;
    }
}
