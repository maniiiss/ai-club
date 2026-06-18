package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.dto.CodeReviewResult;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.request.GitlabAutoMergeConfigRequest;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
import com.aiclub.platform.repository.GitlabProductBranchRepository;
import com.aiclub.platform.repository.GitlabProductBranchSyncLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 GitLab 新增分支、Tag、MR 能力的核心服务逻辑。
 */
@ExtendWith(MockitoExtension.class)
class GitlabManagementGitlabActionsTests {

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
    private GitlabAutoMergeWebhookRepository autoMergeWebhookRepository;

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
                autoMergeLogRepository,
                autoMergeWebhookRepository,
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
                transactionManager,
                executionTaskExecutor
        );
    }

    /**
     * 验证绑定仓库查询分支时，会正确复用绑定信息和解密后的 Token。
     */
    @Test
    void shouldListBranchesFromBindingRepository() {
        ProjectGitlabBindingEntity binding = buildBinding();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listBranches("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "main"))
                .thenReturn(List.of(new GitlabApiService.GitlabBranch(
                        "main",
                        true,
                        true,
                        false,
                        "http://gitlab.example.com/group/demo-repo/-/branches/main",
                        "feat: 首页自动带入 MR 标题"
                )));

        List<GitlabBranchSummary> branches = gitlabManagementService.listBindingBranches(1L, "main");

        assertThat(branches).hasSize(1);
        assertThat(branches.get(0).name()).isEqualTo("main");
        assertThat(branches.get(0).defaultBranch()).isTrue();
        assertThat(branches.get(0).latestCommitTitle()).isEqualTo("feat: 首页自动带入 MR 标题");
        verify(gitlabApiService).listBranches("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "main");
    }

    /**
     * 验证创建 Tag 时会将来源分支和结果信息完整透传给前端。
     */
    @Test
    void shouldCreateTagFromSelectedBranch() {
        ProjectGitlabBindingEntity binding = buildBinding();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.createTag("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "v1.2.0", "release/1.2", "版本发布"))
                .thenReturn(new GitlabApiService.GitlabTag("v1.2.0", "版本发布", "abcdef123456", false, "2026-04-10T10:20:30Z"));

        GitlabTagCreateResult result = gitlabManagementService.createBindingTag(1L, new GitlabTagCreateRequest("v1.2.0", "release/1.2", "版本发布"));

        assertThat(result.projectName()).isEqualTo("演示项目");
        assertThat(result.projectRef()).isEqualTo("group/demo-repo");
        assertThat(result.branchName()).isEqualTo("release/1.2");
        assertThat(result.tagName()).isEqualTo("v1.2.0");
        assertThat(result.targetSha()).isEqualTo("abcdef123456");
        assertThat(result.webUrl()).isEqualTo("http://gitlab.example.com/group/demo-repo/-/tags/v1.2.0");
    }

    /**
     * 验证首页快捷入口创建 MR 时会返回完整的 MR 摘要信息。
     */
    @Test
    void shouldCreateMergeRequestFromSelectedBranches() {
        ProjectGitlabBindingEntity binding = buildBinding();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(gitlabUserOauthService.requireCurrentUserAccess("http://gitlab.example.com/api/v4"))
                .thenReturn(new GitlabUserOauthService.CurrentGitlabOauthAccess(
                        GitlabApiService.GitlabAuthorization.bearerToken("user-access-token"),
                        "Alice",
                        "alice"
                ));
        when(gitlabApiService.createMergeRequest(
                "http://gitlab.example.com/api/v4",
                GitlabApiService.GitlabAuthorization.bearerToken("user-access-token"),
                "group/demo-repo",
                "feature/login",
                "main",
                "feat: 登录页联调",
                "补充联调说明"
        ))
                .thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(88L, "feat: 登录页联调", "feature/login", "main", "opened", "http://gitlab.example.com/group/demo-repo/-/merge_requests/88", "2026-04-10T11:22:33Z"));

        GitlabCreateMergeRequestResult result = gitlabManagementService.createBindingMergeRequest(
                1L,
                new GitlabCreateMergeRequestRequest("feature/login", "main", "feat: 登录页联调", "补充联调说明")
        );

        assertThat(result.projectName()).isEqualTo("演示项目");
        assertThat(result.iid()).isEqualTo(88L);
        assertThat(result.sourceBranch()).isEqualTo("feature/login");
        assertThat(result.targetBranch()).isEqualTo("main");
        assertThat(result.webUrl()).isEqualTo("http://gitlab.example.com/group/demo-repo/-/merge_requests/88");
        assertThat(result.actorName()).isEqualTo("Alice");
        assertThat(result.actorUsername()).isEqualTo("alice");
    }

    /**
     * 源分支与目标分支相同应在服务层直接拦截，避免无效请求打到 GitLab。
     */
    @Test
    void shouldRejectMergeRequestWhenSourceAndTargetBranchAreSame() {
        ProjectGitlabBindingEntity binding = buildBinding();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabManagementService.createBindingMergeRequest(
                1L,
                new GitlabCreateMergeRequestRequest("main", "main", "feat: 重复分支校验", "说明")
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("源分支与目标分支不能相同");
    }

    /**
     * 扫描分支留空时，应自动回退到绑定仓库的默认分支，而不是在控制层直接校验失败。
     */
    @Test
    void shouldFallbackToBindingDefaultBranchWhenScanBranchIsBlank() {
        ProjectGitlabBindingEntity binding = buildBinding();
        RepositoryScanRulesetEntity ruleset = buildRuleset();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(repositoryScanRulesetService.requireRulesetByCode("team-default")).thenReturn(ruleset);
        when(repositoryScanRulesetService.buildRulesetSnapshot(ruleset)).thenReturn(Map.of(
                "code", "team-default",
                "name", "团队默认规则集",
                "engineType", "SEMGREP",
                "definitionContent", "rules:\n  - id: team.default\n"
        ));
        when(executionTaskService.createExecutionTask(argThat(request ->
                "main".equals(String.valueOf(request.inputPayload().get("branch")))
                        && "team-default".equals(String.valueOf(request.inputPayload().get("rulesetCode")))
                        && request.inputPayload().containsKey("rulesetSnapshot")
        ))).thenReturn(new com.aiclub.platform.dto.ExecutionTaskSummary(
                99L,
                "演示项目 group/demo-repo 仓库规范扫描",
                ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN,
                "仓库规范扫描",
                "MANUAL",
                null,
                11L,
                "演示项目",
                null,
                null,
                null,
                "PENDING",
                null,
                null,
                0,
                null,
                null,
                "等待调度",
                false,
                false,
                null,
                null,
                "2026-04-14 20:00:00",
                "2026-04-14 20:00:00"
        ));

        var summary = gitlabManagementService.createBindingScanTask(
                1L,
                new com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest("", "team-default", null)
        );

        assertThat(summary.id()).isEqualTo(99L);
        verify(executionTaskService).createExecutionTask(argThat(request ->
                "main".equals(String.valueOf(request.inputPayload().get("branch")))
                        && "team-default".equals(String.valueOf(request.inputPayload().get("rulesetCode")))
                        && request.inputPayload().containsKey("rulesetSnapshot")
        ));
    }

    /**
     * 配置仓库扫描计划智能体时，应把智能体信息固化到扫描任务输入载荷中。
     */
    @Test
    void shouldPersistPlanAgentIntoScanTaskPayload() {
        ProjectGitlabBindingEntity binding = buildBinding();
        RepositoryScanRulesetEntity ruleset = buildRuleset();
        AgentEntity planAgent = buildRepositoryScanPlanAgent();
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(repositoryScanRulesetService.requireRulesetByCode("team-default")).thenReturn(ruleset);
        when(repositoryScanRulesetService.buildRulesetSnapshot(ruleset)).thenReturn(Map.of(
                "code", "team-default",
                "name", "团队默认规则集",
                "engineType", "SEMGREP",
                "definitionContent", "rules:\n  - id: team.default\n"
        ));
        when(agentRepository.findById(6L)).thenReturn(Optional.of(planAgent));
        when(executionTaskService.createExecutionTask(any())).thenReturn(new com.aiclub.platform.dto.ExecutionTaskSummary(
                100L, "扫描任务", ExecutionWorkflowService.SCENARIO_CODEBASE_COMPLIANCE_SCAN, "仓库规范扫描",
                "MANUAL", null, 11L, "演示项目", null, null, null, "PENDING",
                null, null, 0, null, null, "等待调度", false, false, null, null,
                "2026-04-15 10:00:00", "2026-04-15 10:00:00"
        ));

        gitlabManagementService.createBindingScanTask(
                1L,
                new com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest("main", "team-default", 6L)
        );

        verify(agentExecutionService).validateRepositoryScanPlanAgent(6L);
        verify(executionTaskService).createExecutionTask(argThat(request ->
                Long.valueOf(6L).equals(request.inputPayload().get("planAgentId"))
                        && "扫描计划智能体".equals(String.valueOf(request.inputPayload().get("planAgentName")))
        ));
    }

    /**
     * 非仓库扫描计划智能体不允许绑定到扫描任务，避免后续 executable plan 输出结构失控。
     */
    @Test
    void shouldRejectInvalidPlanAgentForScanTask() {
        ProjectGitlabBindingEntity binding = buildBinding();
        RepositoryScanRulesetEntity ruleset = buildRuleset();
        AgentEntity invalidAgent = buildRepositoryScanPlanAgent();
        invalidAgent.setBuiltinCode(AgentExecutionService.BUILTIN_CODE_REVIEW);
        when(bindingRepository.findById(1L)).thenReturn(Optional.of(binding));
        when(repositoryScanRulesetService.requireRulesetByCode("team-default")).thenReturn(ruleset);
        when(agentRepository.findById(7L)).thenReturn(Optional.of(invalidAgent));
        doThrow(new IllegalArgumentException("所选智能体不是可用的仓库扫描计划智能体"))
                .when(agentExecutionService)
                .validateRepositoryScanPlanAgent(7L);

        assertThatThrownBy(() -> gitlabManagementService.createBindingScanTask(
                1L,
                new com.aiclub.platform.dto.request.GitlabBindingScanTaskRequest("main", "team-default", 7L)
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("所选智能体不是可用的仓库扫描计划智能体");
    }

    /**
     * GitLab AI Review 绑定模型时必须是对话模型，避免 Embedding 模型误入评审链路。
     */
    @Test
    void shouldRejectEmbeddingModelForGitlabAiReview() {
        AiModelConfigEntity embeddingModel = new AiModelConfigEntity();
        embeddingModel.setId(9L);
        embeddingModel.setName("向量模型");
        embeddingModel.setModelType(ModelConfigService.MODEL_TYPE_EMBEDDING);
        embeddingModel.setProvider(ModelConfigService.PROVIDER_OPENAI);
        when(aiModelConfigRepository.findById(9L)).thenReturn(Optional.of(embeddingModel));

        assertThatThrownBy(() -> gitlabManagementService.createAutoMergeConfig(new GitlabAutoMergeConfigRequest(
                "AI Review 配置",
                "STANDALONE",
                "验证 AI Review 模型类型限制",
                null,
                "http://gitlab.example.com/api/v4",
                "group/demo-repo",
                "gitlab-token",
                "feature/test",
                "main",
                "feat:",
                true,
                true,
                false,
                true,
                false,
                true,
                false,
                null,
                null,
                9L,
                true,
                "请审查当前 MR"
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("AI Review 仅支持绑定对话模型配置");
    }

    /**
     * 同一 GitLab 项目与 MR 最近一次 AI 拒绝中的问题，应在下一次复审时继续带入。
     */
    @Test
    void shouldCarryLatestRejectedIssuesIntoFollowUpReview() {
        GitlabAutoMergeConfigEntity config = buildStandaloneAutoMergeConfig();
        GitlabApiService.GitlabMergeRequest mergeRequest = buildMergeRequest(31L, "修复登录空指针");
        GitlabApiService.GitlabMergeRequestChanges changes = buildMergeRequestChanges(31L, "修复登录空指针");
        GitlabAutoMergeLogEntity historyLog = new GitlabAutoMergeLogEntity();
        historyLog.setReviewIssuesJson("[\"补充登录空值判断\"]");

        when(autoMergeConfigRepository.findById(21L)).thenReturn(Optional.of(config));
        when(autoMergeConfigRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(autoMergeLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "opened", "main"))
                .thenReturn(List.of(mergeRequest));
        when(gitlabApiService.fetchMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 31L))
                .thenReturn(mergeRequest);
        when(gitlabApiService.fetchMergeRequestChanges("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 31L))
                .thenReturn(changes);
        when(autoMergeLogRepository.findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                "group/demo-repo", 31L, "AI_REJECTED"
        )).thenReturn(Optional.of(historyLog));
        when(codeReviewClientService.reviewMergeRequest(any(), any(), any(), any(), eq(List.of("补充登录空值判断"))))
                .thenReturn(new CodeReviewResult(
                        false,
                        "历史问题尚未修复",
                        ModelConfigService.PROVIDER_OPENAI,
                        List.of("补充登录空值判断"),
                        "# 代码审查",
                        List.of(),
                        List.of("补充登录空值判断")
                ));

        var result = gitlabManagementService.runAutoMergeConfig(21L);

        assertThat(result.matchedCount()).isEqualTo(1);
        assertThat(result.skippedCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.action()).isEqualTo("AI_REJECTED");
            assertThat(item.message()).contains("历史问题尚未修复");
        });
        verify(codeReviewClientService).reviewMergeRequest(any(), any(), any(), any(), eq(List.of("补充登录空值判断")));
    }

    /**
     * 即使模型误返回允许合并，只要仍有历史问题未修复，后端也必须强制拦截自动合并。
     */
    @Test
    void shouldRejectMergeWhenHistoricalIssueStillUnresolved() {
        GitlabAutoMergeConfigEntity config = buildStandaloneAutoMergeConfig();
        GitlabApiService.GitlabMergeRequest mergeRequest = buildMergeRequest(32L, "继续修复登录空指针");
        GitlabApiService.GitlabMergeRequestChanges changes = buildMergeRequestChanges(32L, "继续修复登录空指针");
        GitlabAutoMergeLogEntity historyLog = new GitlabAutoMergeLogEntity();
        historyLog.setReviewIssuesJson("[\"补充登录空值判断\"]");

        when(autoMergeConfigRepository.findById(21L)).thenReturn(Optional.of(config));
        when(autoMergeConfigRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(autoMergeLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "opened", "main"))
                .thenReturn(List.of(mergeRequest));
        when(gitlabApiService.fetchMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 32L))
                .thenReturn(mergeRequest);
        when(gitlabApiService.fetchMergeRequestChanges("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 32L))
                .thenReturn(changes);
        when(autoMergeLogRepository.findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                "group/demo-repo", 32L, "AI_REJECTED"
        )).thenReturn(Optional.of(historyLog));
        when(codeReviewClientService.reviewMergeRequest(any(), any(), any(), any(), eq(List.of("补充登录空值判断"))))
                .thenReturn(new CodeReviewResult(
                        true,
                        "代码已修复，可以合并",
                        ModelConfigService.PROVIDER_OPENAI,
                        List.of("补充登录空值判断"),
                        "# 代码审查",
                        List.of(),
                        List.of("补充登录空值判断")
                ));

        var result = gitlabManagementService.runAutoMergeConfig(21L);

        assertThat(result.items()).singleElement().satisfies(item -> assertThat(item.action()).isEqualTo("AI_REJECTED"));
        verify(gitlabApiService, never()).acceptMergeRequest(anyString(), anyString(), anyString(), anyLong(), anyBoolean(), anyBoolean(), anyBoolean());
    }

    /**
     * 同一历史问题即使本次描述更详细，也不应被误判为“本次新增问题”。
     */
    @Test
    void shouldNotTreatExpandedWordingAsNewIssue() {
        GitlabAutoMergeConfigEntity config = buildStandaloneAutoMergeConfig();
        GitlabApiService.GitlabMergeRequest mergeRequest = buildMergeRequest(35L, "附件管理传参调整");
        GitlabApiService.GitlabMergeRequestChanges changes = buildMergeRequestChanges(35L, "附件管理传参调整");
        GitlabAutoMergeLogEntity historyLog = new GitlabAutoMergeLogEntity();
        historyLog.setReviewIssuesJson("[\"变更2中 teamMembers 数组元素可能为 null 或 undefined，导致 map 展开报错\"]");

        when(autoMergeConfigRepository.findById(21L)).thenReturn(Optional.of(config));
        when(autoMergeConfigRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(autoMergeLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "opened", "main"))
                .thenReturn(List.of(mergeRequest));
        when(gitlabApiService.fetchMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 35L))
                .thenReturn(mergeRequest);
        when(gitlabApiService.fetchMergeRequestChanges("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 35L))
                .thenReturn(changes);
        when(autoMergeLogRepository.findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                "group/demo-repo", 35L, "AI_REJECTED"
        )).thenReturn(Optional.of(historyLog));
        when(codeReviewClientService.reviewMergeRequest(any(), any(), any(), any(), eq(List.of("变更2中 teamMembers 数组元素可能为 null 或 undefined，导致 map 展开报错"))))
                .thenReturn(new CodeReviewResult(
                        false,
                        "历史问题未修复",
                        ModelConfigService.PROVIDER_OPENAI,
                        List.of("变更2中 teamMembers 数组元素可能为 null 或 undefined，使用展开运算符 {...member} 时会报错，建议先过滤或使用空对象默认值"),
                        "# 代码审查",
                        List.of(),
                        List.of("变更2中 teamMembers 数组元素可能为 null 或 undefined，导致 map 展开报错")
                ));

        gitlabManagementService.runAutoMergeConfig(21L);

        verify(autoMergeLogRepository).save(argThat(log ->
                "AI_REJECTED".equals(log.getResult())
                        && log.getDetailMarkdown() != null
                        && log.getDetailMarkdown().contains("### 本次新增问题\n- 无")
        ));
    }

    /**
     * 历史问题已修复时，合并成功日志需要保留修复摘要，便于后续追溯。
     */
    @Test
    void shouldPersistResolvedHistoricalIssuesIntoMergedLog() {
        GitlabAutoMergeConfigEntity config = buildStandaloneAutoMergeConfig();
        GitlabApiService.GitlabMergeRequest mergeRequest = buildMergeRequest(33L, "完成登录空指针修复");
        GitlabApiService.GitlabMergeRequestChanges changes = buildMergeRequestChanges(33L, "完成登录空指针修复");
        GitlabAutoMergeLogEntity historyLog = new GitlabAutoMergeLogEntity();
        historyLog.setReviewIssuesJson("[\"补充登录空值判断\"]");

        when(autoMergeConfigRepository.findById(21L)).thenReturn(Optional.of(config));
        when(autoMergeConfigRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(autoMergeLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "opened", "main"))
                .thenReturn(List.of(mergeRequest));
        when(gitlabApiService.fetchMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 33L))
                .thenReturn(mergeRequest);
        when(gitlabApiService.fetchMergeRequestChanges("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 33L))
                .thenReturn(changes);
        when(autoMergeLogRepository.findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                "group/demo-repo", 33L, "AI_REJECTED"
        )).thenReturn(Optional.of(historyLog));
        when(codeReviewClientService.reviewMergeRequest(any(), any(), any(), any(), eq(List.of("补充登录空值判断"))))
                .thenReturn(new CodeReviewResult(
                        true,
                        "历史问题已修复",
                        ModelConfigService.PROVIDER_OPENAI,
                        List.of(),
                        "# 代码审查",
                        List.of("补充登录空值判断"),
                        List.of()
                ));
        when(gitlabApiService.acceptMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 33L, true, false, true))
                .thenReturn(new GitlabApiService.GitlabMergeResult("merged", "http://gitlab.example.com/group/demo-repo/-/merge_requests/33", "abc123", "merged"));

        var result = gitlabManagementService.runAutoMergeConfig(21L);

        assertThat(result.mergedCount()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> assertThat(item.action()).isEqualTo("MERGED"));
        verify(autoMergeLogRepository).save(argThat(log ->
                "MERGED".equals(log.getResult())
                        && "[\"补充登录空值判断\"]".equals(log.getResolvedPreviousIssuesJson())
                        && "[]".equals(log.getReviewIssuesJson())
                        && log.getDetailMarkdown() != null
                        && log.getDetailMarkdown().contains("已修复项")
        ));
    }

    /**
     * 老日志没有结构化问题字段时，不应抛错，下一次复审直接按“无历史问题”处理。
     */
    @Test
    void shouldIgnoreLegacyRejectedLogWithoutStructuredIssues() {
        GitlabAutoMergeConfigEntity config = buildStandaloneAutoMergeConfig();
        GitlabApiService.GitlabMergeRequest mergeRequest = buildMergeRequest(34L, "兼容旧日志格式");
        GitlabApiService.GitlabMergeRequestChanges changes = buildMergeRequestChanges(34L, "兼容旧日志格式");
        GitlabAutoMergeLogEntity historyLog = new GitlabAutoMergeLogEntity();
        historyLog.setReviewIssuesJson(null);

        when(autoMergeConfigRepository.findById(21L)).thenReturn(Optional.of(config));
        when(autoMergeConfigRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(autoMergeLogRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(tokenCipherService.decrypt("cipher-token")).thenReturn("plain-token");
        when(gitlabApiService.listMergeRequests("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", "opened", "main"))
                .thenReturn(List.of(mergeRequest));
        when(gitlabApiService.fetchMergeRequest("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 34L))
                .thenReturn(mergeRequest);
        when(gitlabApiService.fetchMergeRequestChanges("http://gitlab.example.com/api/v4", "plain-token", "group/demo-repo", 34L))
                .thenReturn(changes);
        when(autoMergeLogRepository.findTopByGitlabProjectRefSnapshotAndMergeRequestIidAndResultOrderByExecutedAtDescIdDesc(
                "group/demo-repo", 34L, "AI_REJECTED"
        )).thenReturn(Optional.of(historyLog));
        when(codeReviewClientService.reviewMergeRequest(any(), any(), any(), any(), eq(List.of())))
                .thenReturn(new CodeReviewResult(
                        false,
                        "存在新的风险",
                        ModelConfigService.PROVIDER_OPENAI,
                        List.of("新增接口缺少鉴权"),
                        "# 代码审查",
                        List.of(),
                        List.of()
                ));

        var result = gitlabManagementService.runAutoMergeConfig(21L);

        assertThat(result.skippedCount()).isEqualTo(1);
        verify(codeReviewClientService).reviewMergeRequest(any(), any(), any(), any(), eq(List.of()));
    }

    /**
     * 构造一个包含平台项目、仓库路径和默认分支的绑定样例，供多个测试复用。
     */
    private ProjectGitlabBindingEntity buildBinding() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于验证 GitLab 扩展能力");
        project.setId(11L);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(1L);
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/demo-repo");
        binding.setGitlabProjectPath("group/demo-repo");
        binding.setGitlabProjectWebUrl("http://gitlab.example.com/group/demo-repo");
        binding.setDefaultTargetBranch("main");
        binding.setProductMainBranch("main");
        binding.setTokenCiphertext("cipher-token");
        binding.setEnabled(true);
        return binding;
    }

    /**
     * 构造默认规则集样例，供扫描任务创建测试复用。
     */
    private RepositoryScanRulesetEntity buildRuleset() {
        RepositoryScanRulesetEntity entity = new RepositoryScanRulesetEntity();
        entity.setId(7L);
        entity.setCode("team-default");
        entity.setName("团队默认规则集");
        entity.setDescription("默认规则");
        entity.setEngineType("SEMGREP");
        entity.setEnabled(true);
        entity.setDefaultSelected(true);
        entity.setDefinitionContent("rules:\n  - id: team.default\n");
        return entity;
    }

    /**
     * 构造合法的仓库扫描计划智能体样例。
     */
    private AgentEntity buildRepositoryScanPlanAgent() {
        AgentEntity entity = new AgentEntity();
        entity.setId(6L);
        entity.setName("扫描计划智能体");
        entity.setType("规划");
        entity.setStatus("在线");
        entity.setEnabled(true);
        entity.setAccessType(AgentExecutionService.ACCESS_BUILT_IN);
        entity.setBuiltinCode(AgentExecutionService.BUILTIN_REPOSITORY_SCAN_PLAN);
        entity.setCapability("根据扫描报告生成可执行计划");
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(3L);
        entity.setAiModelConfig(modelConfig);
        return entity;
    }

    /**
     * 构造一个启用 AI Review 的独立自动合并策略，供历史问题带入场景复用。
     */
    private GitlabAutoMergeConfigEntity buildStandaloneAutoMergeConfig() {
        GitlabAutoMergeConfigEntity entity = new GitlabAutoMergeConfigEntity();
        entity.setId(21L);
        entity.setName("AI 自动合并");
        entity.setExecutionMode("STANDALONE");
        entity.setApiBaseUrl("http://gitlab.example.com/api/v4");
        entity.setGitlabProjectRef("group/demo-repo");
        entity.setTargetBranch("main");
        entity.setTokenCiphertext("cipher-token");
        entity.setEnabled(true);
        entity.setAutoMerge(true);
        entity.setSquashOnMerge(false);
        entity.setRemoveSourceBranch(true);
        entity.setRequirePipelineSuccess(true);
        entity.setAiReviewEnabled(true);
        AiModelConfigEntity modelConfig = new AiModelConfigEntity();
        modelConfig.setId(6L);
        modelConfig.setName("代码审查模型");
        modelConfig.setModelType(ModelConfigService.MODEL_TYPE_CHAT);
        modelConfig.setProvider(ModelConfigService.PROVIDER_OPENAI);
        entity.setAiModelConfig(modelConfig);
        return entity;
    }

    /**
     * 构造自动合并测试用的开放 MR。
     */
    private GitlabApiService.GitlabMergeRequest buildMergeRequest(Long iid, String title) {
        return new GitlabApiService.GitlabMergeRequest(
                iid,
                title,
                "opened",
                "feature/login",
                "main",
                false,
                false,
                "can_be_merged",
                "success",
                "Alice",
                "alice",
                "http://gitlab.example.com/group/demo-repo/-/merge_requests/" + iid,
                "2026-06-17T10:00:00Z",
                0
        );
    }

    /**
     * 构造自动合并复审测试用的 Diff 快照。
     */
    private GitlabApiService.GitlabMergeRequestChanges buildMergeRequestChanges(Long iid, String title) {
        return new GitlabApiService.GitlabMergeRequestChanges(
                iid,
                title,
                "修复登录逻辑",
                List.of(new GitlabApiService.GitlabChange(
                        "src/LoginService.java",
                        "src/LoginService.java",
                        "+ if (user == null) { throw new IllegalArgumentException(); }",
                        false,
                        false,
                        false
                ))
        );
    }
}
