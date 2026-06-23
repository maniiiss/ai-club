package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeProjectShareEntity;
import com.aiclub.platform.domain.model.JenkinsServerEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.dto.AiClubPipelineRunSummary;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
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
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖项目只读分享页扩展能力：列出绑定的流水线、按 share token 分页拉取流水线运行历史。
 *
 * <p>共享同一份 share token，不同来源（Woodpecker / Jenkins）通过 {@code kind} 参数路由；
 * 仅暴露 6 个非敏感字段；外部 CI 调用失败时返回空列表 + warning 而不是抛错。</p>
 */
@ExtendWith(MockitoExtension.class)
class GitlabPublicPipelineShareTests {

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
    private CreditConsumptionService creditConsumptionService;

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
                creditConsumptionService,
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
     * 公开访问者通过有效分享 token 可拿到该项目下 Woodpecker + Jenkins 流水线的合并摘要。
     */
    @Test
    void shouldAggregateWoodpeckerAndJenkinsPipelinesForShare() {
        ProjectEntity project = sampleProject();
        bindShare(project, "share-token-11");

        AiClubPipelineEntity wood = new AiClubPipelineEntity();
        wood.setId(101L);
        wood.setProject(project);
        wood.setName("主线发布");
        wood.setDefaultBranch("main");
        wood.setLastRunStatus("success");
        wood.setLastRunUrl("http://woodpecker.example.com/repos/9/pipeline/12");
        wood.setLastTriggeredAt(LocalDateTime.of(2026, 6, 19, 10, 0));

        ProjectPipelineBindingEntity jenkins = new ProjectPipelineBindingEntity();
        jenkins.setId(202L);
        jenkins.setProject(project);
        JenkinsServerEntity server = new JenkinsServerEntity();
        server.setId(7L);
        server.setBaseUrl("http://jenkins.example.com");
        server.setUsername("ci");
        server.setTokenCiphertext("token-cipher");
        jenkins.setJenkinsServer(server);
        jenkins.setJobName("demo-deploy");
        jenkins.setDefaultBranch("release/1.0");
        jenkins.setLastTriggerStatus("SUCCESS");
        jenkins.setLastTriggerUrl("http://jenkins.example.com/job/demo-deploy/9");
        jenkins.setLastTriggeredAt(LocalDateTime.of(2026, 6, 19, 9, 30));

        when(aiClubPipelineRepository.findByProject_IdOrderByIdAsc(11L)).thenReturn(List.of(wood));
        when(projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(11L)).thenReturn(List.of(jenkins));

        var result = gitlabManagementService.listPublicPipelinesByShare(11L, "share-token-11");

        assertThat(result).hasSize(2);
        assertThat(result.get(0).kind()).isEqualTo("WOODPECKER");
        assertThat(result.get(0).id()).isEqualTo(101L);
        assertThat(result.get(0).name()).isEqualTo("主线发布");
        assertThat(result.get(1).kind()).isEqualTo("JENKINS");
        assertThat(result.get(1).id()).isEqualTo(202L);
        assertThat(result.get(1).name()).isEqualTo("demo-deploy");
        assertThat(result.get(1).defaultBranch()).isEqualTo("release/1.0");
    }

    /**
     * 已失效的 share 必须直接拒绝，连项目下流水线列表都不允许暴露。
     */
    @Test
    void shouldRejectListingPipelinesWhenShareDisabled() {
        ProjectEntity project = sampleProject();
        GitlabAutoMergeProjectShareEntity share = new GitlabAutoMergeProjectShareEntity();
        share.setProject(project);
        share.setEnabled(false);
        share.setTokenCiphertext("cipher");
        when(projectRepository.findById(11L)).thenReturn(Optional.of(project));
        when(autoMergeProjectShareRepository.findByProject_Id(11L)).thenReturn(Optional.of(share));

        assertThatThrownBy(() -> gitlabManagementService.listPublicPipelinesByShare(11L, "share-token-11"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("分享链接已失效");

        verify(aiClubPipelineRepository, never()).findByProject_IdOrderByIdAsc(11L);
        verify(projectPipelineBindingRepository, never()).findByProject_IdOrderByIdAsc(11L);
    }

    /**
     * 分享 token 校验通过，但请求中的 pipelineId 不属于当前项目，应抛 NoSuchElementException 防越权。
     */
    @Test
    void shouldRejectWoodpeckerPipelineFromOtherProject() {
        ProjectEntity project = sampleProject();
        bindShare(project, "share-token-11");

        ProjectEntity otherProject = new ProjectEntity("其他项目", "李四", "进行中", "");
        otherProject.setId(99L);
        AiClubPipelineEntity foreign = new AiClubPipelineEntity();
        foreign.setId(700L);
        foreign.setProject(otherProject);
        when(aiClubPipelineRepository.findById(700L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> gitlabManagementService.pagePublicPipelineRunsByShare(
                11L, "share-token-11", "WOODPECKER", 700L, 1, 10))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessageContaining("流水线不属于当前项目");
    }

    /**
     * Woodpecker 正常路径：底层 cicd service 返回 run 列表，公开侧仅保留 6 个摘要字段。
     */
    @Test
    void shouldMapWoodpeckerRunsToPublicSummary() {
        ProjectEntity project = sampleProject();
        bindShare(project, "share-token-11");

        AiClubPipelineEntity pipeline = new AiClubPipelineEntity();
        pipeline.setId(101L);
        pipeline.setProject(project);
        pipeline.setName("主线发布");
        when(aiClubPipelineRepository.findById(101L)).thenReturn(Optional.of(pipeline));

        AiClubPipelineRunSummary run = new AiClubPipelineRunSummary(
                12,
                "success",
                "main",
                "push",
                "fix bug",          // message —— 不应进入分享 DTO
                "abc1234",          // commit —— 不应进入分享 DTO
                "http://wood.example/run/12",
                "2026-06-19 10:00:00",
                "2026-06-19 10:00:05",
                "2026-06-19 10:01:00",
                55_000L,
                "55s"
        );
        when(cicdManagementService.listAiClubPipelineRuns(eq(101L), anyInt())).thenReturn(List.of(run));

        var page = gitlabManagementService.pagePublicPipelineRunsByShare(
                11L, "share-token-11", "WOODPECKER", 101L, 1, 10);

        assertThat(page.projectId()).isEqualTo(11L);
        assertThat(page.pipelineKind()).isEqualTo("WOODPECKER");
        assertThat(page.pipelineId()).isEqualTo(101L);
        assertThat(page.warning()).isNull();
        assertThat(page.runs().records()).singleElement().satisfies(item -> {
            assertThat(item.runNumber()).isEqualTo(12);
            assertThat(item.status()).isEqualTo("success");
            assertThat(item.branch()).isEqualTo("main");
            assertThat(item.event()).isEqualTo("push");
            assertThat(item.runUrl()).isEqualTo("http://wood.example/run/12");
            assertThat(item.triggeredAt()).isEqualTo("2026-06-19 10:00:05");
        });
    }

    /**
     * Jenkins 远程调用失败时，分享页应返回空列表 + warning，避免一次外部故障拖垮整个分享页。
     */
    @Test
    void shouldFallbackWhenJenkinsApiFails() {
        ProjectEntity project = sampleProject();
        bindShare(project, "share-token-11");

        ProjectPipelineBindingEntity jenkins = new ProjectPipelineBindingEntity();
        jenkins.setId(202L);
        jenkins.setProject(project);
        jenkins.setJobName("demo-deploy");
        jenkins.setDefaultBranch("release/1.0");
        when(projectPipelineBindingRepository.findById(202L)).thenReturn(Optional.of(jenkins));
        when(cicdManagementService.listPipelineBuilds(eq(202L), anyInt()))
                .thenThrow(new RuntimeException("Jenkins 不可达"));

        var page = gitlabManagementService.pagePublicPipelineRunsByShare(
                11L, "share-token-11", "JENKINS", 202L, 1, 10);

        assertThat(page.runs().records()).isEmpty();
        // warning 为对外的可读提示，不再回传原始异常文本（含 Jenkins 登录 HTML 等敏感/噪声内容）
        assertThat(page.warning()).isNotBlank();
        assertThat(page.warning()).doesNotContain("Jenkins 不可达");
    }

    /**
     * Jenkins 正常路径：building=true 的构建在分享页应展示为 RUNNING，分支取绑定的默认分支。
     */
    @Test
    void shouldMapJenkinsBuildsToPublicSummary() {
        ProjectEntity project = sampleProject();
        bindShare(project, "share-token-11");

        ProjectPipelineBindingEntity jenkins = new ProjectPipelineBindingEntity();
        jenkins.setId(202L);
        jenkins.setProject(project);
        jenkins.setJobName("demo-deploy");
        jenkins.setDefaultBranch("release/1.0");
        when(projectPipelineBindingRepository.findById(202L)).thenReturn(Optional.of(jenkins));

        JenkinsBuildSummary running = new JenkinsBuildSummary(
                9,
                "http://jenkins.example/job/demo-deploy/9",
                null,
                Boolean.TRUE,
                "2026-06-19 09:30:00",
                0L,
                "0s",
                "running"           // description —— 不应出现在公开 DTO
        );
        when(cicdManagementService.listPipelineBuilds(eq(202L), anyInt())).thenReturn(List.of(running));

        var page = gitlabManagementService.pagePublicPipelineRunsByShare(
                11L, "share-token-11", "JENKINS", 202L, 1, 10);

        assertThat(page.runs().records()).singleElement().satisfies(item -> {
            assertThat(item.runNumber()).isEqualTo(9);
            assertThat(item.status()).isEqualTo("RUNNING");
            assertThat(item.branch()).isEqualTo("release/1.0");
            assertThat(item.event()).isEqualTo("MANUAL");
        });
    }

    private ProjectEntity sampleProject() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "用于流水线只读分享");
        project.setId(11L);
        return project;
    }

    /**
     * 复用一份"已启用、未过期、token 已加密"的 share 记录，避免每个测试重复写。
     */
    private void bindShare(ProjectEntity project, String plainToken) {
        GitlabAutoMergeProjectShareEntity share = new GitlabAutoMergeProjectShareEntity();
        share.setProject(project);
        share.setEnabled(true);
        share.setExpiresAt(LocalDateTime.now().plusDays(1));
        share.setTokenCiphertext("cipher-" + plainToken);
        when(projectRepository.findById(project.getId())).thenReturn(Optional.of(project));
        when(autoMergeProjectShareRepository.findByProject_Id(project.getId())).thenReturn(Optional.of(share));
        when(tokenCipherService.decrypt("cipher-" + plainToken)).thenReturn(plainToken);
    }

    /**
     * 关键回归守护：本方法必须以 NOT_SUPPORTED 传播级别声明，
     * 否则 class 级别 readOnly 事务会被底层 Jenkins / Woodpecker RuntimeException
     * 标记为 rollback-only，分享页虽然 200 但事务提交时会抛 UnexpectedRollbackException。
     */
    @Test
    void shouldDeclareNotSupportedTransactionPropagationOnPagePublicPipelineRuns() throws NoSuchMethodException {
        java.lang.reflect.Method method = com.aiclub.platform.service.GitlabManagementService.class.getMethod(
                "pagePublicPipelineRunsByShare", Long.class, String.class, String.class, Long.class, int.class, int.class);
        org.springframework.transaction.annotation.Transactional annotation =
                method.getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertThat(annotation).as("pagePublicPipelineRunsByShare 必须显式声明 @Transactional 以覆盖 class 级别 readOnly 设定").isNotNull();
        assertThat(annotation.propagation()).isEqualTo(org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED);
    }
}
