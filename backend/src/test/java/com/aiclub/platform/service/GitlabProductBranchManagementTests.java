package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabProductBranchEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabProductBranchSummary;
import com.aiclub.platform.dto.GitlabProductBranchSyncRunResult;
import com.aiclub.platform.dto.request.GitlabCreateProductBranchSyncRequest;
import com.aiclub.platform.dto.request.GitlabProductBranchRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergePipelineTargetRepository;
import com.aiclub.platform.repository.GitlabAutoMergeProjectShareRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
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

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isA;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 GitLab 产品分支管理 v1 的核心规则：分线定义校验、主线同步判定与批量结果汇总。
 */
@ExtendWith(MockitoExtension.class)
class GitlabProductBranchManagementTests {

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
                gitlabCodeStructureSnapshotRepository,
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

    /**
     * 分线分支名不能与产品主线相同，否则同步链路会退化成主线给自己提 MR。
     */
    @Test
    void shouldRejectProductBranchWhenBranchMatchesMainline() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabManagementService.createProductBranch(
                1L,
                new GitlabProductBranchRequest("line-a", "A 产品线", "main", true)
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("分线分支不能与产品主线分支相同");
    }

    /**
     * 同一绑定下产品线编码必须唯一，避免批量同步和日志检索出现二义性。
     */
    @Test
    void shouldRejectDuplicateProductBranchLineCode() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(productBranchRepository.existsByBinding_IdAndLineCodeIgnoreCase(1L, "line-a")).thenReturn(true);

        assertThatThrownBy(() -> gitlabManagementService.createProductBranch(
                1L,
                new GitlabProductBranchRequest("line-a", "重复编码产品线", "release/a", true)
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前绑定下已存在相同的产品线编码");
    }

    /**
     * 未配置产品主线时，不允许发起主线到分线的同步。
     */
    @Test
    void shouldRejectSyncWhenMainlineMissing() {
        ProjectGitlabBindingEntity binding = buildBinding(null);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("请先在 GitLab 绑定中配置产品主线分支");
    }

    /**
     * 主线同步必须以当前登录用户的 GitLab OAuth 身份发起；没有 OAuth 时直接拦截。
     */
    @Test
    void shouldRejectSyncWhenOauthAccessMissing() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(gitlabUserOauthService.requireCurrentUserAccess("http://gitlab.example.com/api/v4"))
                .thenThrow(new IllegalArgumentException("当前用户尚未绑定 GitLab 账户，请先前往个人中心完成授权"));

        assertThatThrownBy(() -> gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前用户尚未绑定 GitLab 账户，请先前往个人中心完成授权");
    }

    /**
     * compare 结果为空时应返回 NO_CHANGE，不重复创建同步 MR。
     */
    @Test
    void shouldReturnNoChangeWhenMainlineHasNoDiff() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        GitlabProductBranchEntity branch = buildProductBranch(101L, binding, "line-a", "A 产品线", "release/a", true);
        mockSyncTarget(binding, branch);
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "main"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("main", true, true, false, "", "main-sha"));
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("release/a", false, false, false, "", "release-sha"));
        when(gitlabApiService.compareBranches("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a", "main"))
                .thenReturn(new GitlabApiService.GitlabCompareResult(false, false, List.of()));

        GitlabProductBranchSyncRunResult result = gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        );

        assertThat(result.noChangeCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.result()).isEqualTo("NO_CHANGE");
            assertThat(item.message()).isEqualTo("主线当前没有新增提交需要同步到该分线");
        });
        verify(gitlabApiService, never()).createMergeRequest(any(), isA(GitlabApiService.GitlabAuthorization.class), any(), any(), any(), any(), any());
    }

    /**
     * 如果同源同目标已经存在开放 MR，应直接返回 EXISTING_OPEN_MR。
     */
    @Test
    void shouldReturnExistingOpenMrWhenOpenSyncMrAlreadyExists() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        GitlabProductBranchEntity branch = buildProductBranch(101L, binding, "line-a", "A 产品线", "release/a", true);
        mockSyncTarget(binding, branch);
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "main"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("main", true, true, false, "", "main-sha"));
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("release/a", false, false, false, "", "release-sha"));
        when(gitlabApiService.compareBranches("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a", "main"))
                .thenReturn(new GitlabApiService.GitlabCompareResult(false, false, List.of("c1")));
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "opened", "main", "release/a"))
                .thenReturn(List.of(new GitlabApiService.GitlabMergeRequest(
                        88L, "[主线同步] main -> release/a", "opened", "main", "release/a",
                        false, false, "can_be_merged", "success", "Alice", "alice",
                        "http://gitlab.example.com/group/demo-repo/-/merge_requests/88", "2026-04-20T10:00:00Z", 1,
                        "", "", ""
                )));

        GitlabProductBranchSyncRunResult result = gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        );

        assertThat(result.existingOpenMrCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.result()).isEqualTo("EXISTING_OPEN_MR");
            assertThat(item.mergeRequestIid()).isEqualTo(88L);
        });
        verify(gitlabApiService, never()).createMergeRequest(any(), isA(GitlabApiService.GitlabAuthorization.class), any(), any(), any(), any(), any());
    }

    /**
     * 主线领先于分线且没有开放同步 MR 时，应创建新的同步 MR。
     */
    @Test
    void shouldCreateSyncMergeRequestSuccessfully() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        GitlabProductBranchEntity branch = buildProductBranch(101L, binding, "line-a", "A 产品线", "release/a", true);
        mockSyncTarget(binding, branch);
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "main"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("main", true, true, false, "", "main-sha"));
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("release/a", false, false, false, "", "release-sha"));
        when(gitlabApiService.compareBranches("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a", "main"))
                .thenReturn(new GitlabApiService.GitlabCompareResult(false, false, List.of("c1", "c2")));
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "opened", "main", "release/a"))
                .thenReturn(List.of());
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                eq(GitlabApiService.GitlabAuthorization.bearerToken("oauth-token")),
                eq("group/demo-repo"),
                eq("main"),
                eq("release/a"),
                eq("[主线同步] main -> release/a"),
                argThat((String description) -> description != null
                        && description.contains("平台项目：演示项目")
                        && description.contains("产品线：A 产品线 (line-a)")
                        && description.contains("主线分支：main")
                        && description.contains("分线分支：release/a"))
        )).thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                99L,
                "[主线同步] main -> release/a",
                "main",
                "release/a",
                "opened",
                "http://gitlab.example.com/group/demo-repo/-/merge_requests/99",
                "2026-04-28T12:31:32Z"
        ));

        GitlabProductBranchSyncRunResult result = gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        );

        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.result()).isEqualTo("CREATED");
            assertThat(item.mergeRequestIid()).isEqualTo(99L);
            assertThat(item.behindCount()).isEqualTo(2);
        });
    }

    /**
     * 批量同步时应保留部分成功结果，而不是因为某条分线失败就整体回滚。
     */
    @Test
    void shouldKeepPartialBatchSyncResult() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        GitlabProductBranchEntity successBranch = buildProductBranch(101L, binding, "line-a", "A 产品线", "release/a", true);
        GitlabProductBranchEntity disabledBranch = buildProductBranch(102L, binding, "line-b", "B 产品线", "release/b", false);
        mockSyncTarget(binding, successBranch, disabledBranch);
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "main"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("main", true, true, false, "", "main-sha"));
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("release/a", false, false, false, "", "release-sha"));
        when(gitlabApiService.compareBranches("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a", "main"))
                .thenReturn(new GitlabApiService.GitlabCompareResult(false, false, List.of("c1")));
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "opened", "main", "release/a"))
                .thenReturn(List.of());
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                eq(GitlabApiService.GitlabAuthorization.bearerToken("oauth-token")),
                eq("group/demo-repo"),
                eq("main"),
                eq("release/a"),
                isA(String.class),
                isA(String.class)
        ))
                .thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                        99L,
                        "[主线同步] main -> release/a",
                        "main",
                        "release/a",
                        "opened",
                        "http://gitlab.example.com/group/demo-repo/-/merge_requests/99",
                        "2026-04-28T12:31:32Z"
                ));

        GitlabProductBranchSyncRunResult result = gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L, 102L))
        );

        assertThat(result.createdCount()).isEqualTo(1);
        assertThat(result.failedCount()).isEqualTo(1);
        assertThat(result.items())
                .extracting(item -> item.result())
                .containsExactly("CREATED", "FAILED");
    }

    /**
     * GitLab 返回超长错误文本时，最近同步摘要必须收敛到列长度以内，避免事务在提交时被标记为 rollback-only。
     */
    @Test
    void shouldTrimProductBranchStateMessageToColumnLength() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        GitlabProductBranchEntity branch = buildProductBranch(101L, binding, "line-a", "A 产品线", "release/a", true);
        mockSyncTarget(binding, branch);
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "main"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("main", true, true, false, "", "main-sha"));
        when(gitlabApiService.fetchBranch("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a"))
                .thenReturn(new GitlabApiService.GitlabBranchDetail("release/a", false, false, false, "", "release-sha"));
        when(gitlabApiService.compareBranches("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "release/a", "main"))
                .thenReturn(new GitlabApiService.GitlabCompareResult(false, false, List.of("c1")));
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"), "group/demo-repo", "opened", "main", "release/a"))
                .thenReturn(List.of());
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                eq(GitlabApiService.GitlabAuthorization.bearerToken("oauth-token")),
                eq("group/demo-repo"),
                eq("main"),
                eq("release/a"),
                isA(String.class),
                isA(String.class)
        )).thenThrow(new IllegalStateException("x".repeat(900)));
        doAnswer(invocation -> {
            GitlabProductBranchEntity saved = invocation.getArgument(0);
            assertThat(saved.getLastSyncMessage()).hasSizeLessThanOrEqualTo(500);
            return saved;
        }).when(productBranchRepository).save(any(GitlabProductBranchEntity.class));

        GitlabProductBranchSyncRunResult result = gitlabManagementService.createProductBranchSyncMergeRequests(
                1L,
                new GitlabCreateProductBranchSyncRequest(List.of(101L))
        );

        assertThat(result.failedCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> assertThat(item.result()).isEqualTo("FAILED"));
    }

    /**
     * 创建产品分线时应返回基础摘要，供前端表格即时追加数据。
     */
    @Test
    void shouldCreateProductBranchSummary() {
        ProjectGitlabBindingEntity binding = buildBinding("main");
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(productBranchRepository.save(any(GitlabProductBranchEntity.class))).thenAnswer(invocation -> {
            GitlabProductBranchEntity entity = invocation.getArgument(0);
            entity.setId(101L);
            return entity;
        });

        GitlabProductBranchSummary summary = gitlabManagementService.createProductBranch(
                1L,
                new GitlabProductBranchRequest("line-a", "A 产品线", "release/a", true)
        );

        assertThat(summary.id()).isEqualTo(101L);
        assertThat(summary.lineCode()).isEqualTo("line-a");
        assertThat(summary.hasDiffWithMainline()).isFalse();
        assertThat(summary.hasOpenSyncMr()).isFalse();
    }

    private void mockSyncTarget(ProjectGitlabBindingEntity binding, GitlabProductBranchEntity... branches) {
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(productBranchRepository.findAllByBinding_IdOrderByIdAsc(1L)).thenReturn(List.of(branches));
        when(gitlabUserOauthService.requireCurrentUserAccess("http://gitlab.example.com/api/v4"))
                .thenReturn(new GitlabUserOauthService.CurrentGitlabOauthAccess(
                        GitlabApiService.GitlabAuthorization.bearerToken("oauth-token"),
                        "Alice",
                        "alice"
                ));
    }

    private ProjectGitlabBindingEntity buildBinding(String productMainBranch) {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于验证产品分支管理");
        project.setId(11L);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/demo-repo");
        binding.setGitlabProjectPath("group/demo-repo");
        binding.setGitlabProjectWebUrl("http://gitlab.example.com/group/demo-repo");
        binding.setDefaultTargetBranch("main");
        binding.setProductMainBranch(productMainBranch);
        binding.setEnabled(true);
        return binding;
    }

    private GitlabProductBranchEntity buildProductBranch(Long id,
                                                         ProjectGitlabBindingEntity binding,
                                                         String lineCode,
                                                         String lineName,
                                                         String branchName,
                                                         boolean enabled) {
        GitlabProductBranchEntity entity = new GitlabProductBranchEntity();
        entity.setId(id);
        entity.setBinding(binding);
        entity.setLineCode(lineCode);
        entity.setLineName(lineName);
        entity.setBranchName(branchName);
        entity.setEnabled(enabled);
        return entity;
    }
}
