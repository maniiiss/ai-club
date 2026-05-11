package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabUserSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabProductBranchRepository;
import com.aiclub.platform.repository.GitlabProductBranchSyncLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * 覆盖用户管理绑定 GitLab 用户时的远端候选读取链路。
 */
@ExtendWith(MockitoExtension.class)
class GitlabUserLookupServiceTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectGitlabBindingRepository bindingRepository;

    @Mock
    private GitlabAutoMergeConfigRepository autoMergeConfigRepository;

    @Mock
    private GitlabCodeStructureSnapshotRepository gitlabCodeStructureSnapshotRepository;

    @Mock
    private GitlabAutoMergeLogRepository autoMergeLogRepository;

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
    private PlatformTransactionManager transactionManager;

    @Mock
    private Executor executionTaskExecutor;

    private GitlabManagementService gitlabManagementService;

    @BeforeEach
    void setUp() {
        gitlabManagementService = new GitlabManagementService(
                projectRepository,
                bindingRepository,
                gitlabCodeStructureSnapshotRepository,
                autoMergeConfigRepository,
                autoMergeLogRepository,
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
                projectDataPermissionService,
                gitlabUserOauthService,
                executionTaskService,
                repositoryScanClientService,
                repositoryScanRulesetService,
                gitlabCodeStructureClientService,
                gitnexusProperties,
                new ObjectMapper(),
                "http://gitlab.example.com/api/v4",
                transactionManager,
                executionTaskExecutor
        );
    }

    @Test
    void shouldListGitlabUsersWithFirstEnabledBindingToken() {
        ProjectEntity project = new ProjectEntity();
        project.setId(9L);
        project.setName("项目A");

        ProjectGitlabBindingEntity disabledBinding = new ProjectGitlabBindingEntity();
        disabledBinding.setId(10L);
        disabledBinding.setProject(project);
        disabledBinding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        disabledBinding.setGitlabProjectRef("group/disabled");
        disabledBinding.setTokenCiphertext("disabled-cipher");
        disabledBinding.setEnabled(false);

        ProjectGitlabBindingEntity enabledBinding = new ProjectGitlabBindingEntity();
        enabledBinding.setId(11L);
        enabledBinding.setProject(project);
        enabledBinding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        enabledBinding.setGitlabProjectRef("group/enabled");
        enabledBinding.setTokenCiphertext("enabled-cipher");
        enabledBinding.setEnabled(true);

        when(bindingRepository.findAll(Sort.by(Sort.Direction.ASC, "id")))
                .thenReturn(List.of(disabledBinding, enabledBinding));
        when(tokenCipherService.decrypt("enabled-cipher")).thenReturn("plain-token");
        when(gitlabApiService.listUsers("http://gitlab.example.com/api/v4", "plain-token", "张三"))
                .thenReturn(List.of(new GitlabApiService.GitlabUser(
                        991L,
                        "zhangsan",
                        "张三",
                        "zhangsan@example.com",
                        "http://gitlab.example.com/avatar/zhangsan.png",
                        "http://gitlab.example.com/zhangsan"
                )));

        List<GitlabUserSummary> users = gitlabManagementService.listGitlabUsers("张三");

        assertThat(users).hasSize(1);
        assertThat(users.get(0).id()).isEqualTo(991L);
        assertThat(users.get(0).username()).isEqualTo("zhangsan");
        assertThat(users.get(0).name()).isEqualTo("张三");
        assertThat(users.get(0).email()).isEqualTo("zhangsan@example.com");
    }
}
