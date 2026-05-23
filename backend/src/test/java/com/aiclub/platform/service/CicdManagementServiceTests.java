package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.dto.AiClubPipelineConfigCompleteResult;
import com.aiclub.platform.dto.AiClubPipelineConfigPreviewResult;
import com.aiclub.platform.dto.AiClubPipelineConfigStatusItem;
import com.aiclub.platform.dto.AiClubPipelineConfigTemplateItem;
import com.aiclub.platform.dto.AiClubPipelineSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerResult;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.request.AiClubPipelineConfigCompleteRequest;
import com.aiclub.platform.dto.request.AiClubPipelineConfigPreviewRequest;
import com.aiclub.platform.dto.request.AiClubPipelineRequest;
import com.aiclub.platform.dto.request.JenkinsServerRequest;
import com.aiclub.platform.dto.request.ProjectPipelineBindingRequest;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(properties = {
        "platform.woodpecker.enabled=true",
        "platform.woodpecker.internal-base-url=http://woodpecker.example.com",
        "platform.woodpecker.public-base-url=http://woodpecker.example.com",
        "platform.woodpecker.api-token=test-token"
})
@Transactional
class CicdManagementServiceTests {

    @Autowired
    private CicdManagementService cicdManagementService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectPipelineBindingRepository projectPipelineBindingRepository;

    @Autowired
    private ProjectGitlabBindingRepository projectGitlabBindingRepository;

    @Autowired
    private AiClubPipelineRepository aiClubPipelineRepository;

    @MockBean
    private JenkinsApiService jenkinsApiService;

    @MockBean
    private GitlabApiService gitlabApiService;

    @MockBean
    private WoodpeckerApiService woodpeckerApiService;

    @Autowired
    private TokenCipherService tokenCipherService;

    /**
     * 验证同一个业务项目可以同时绑定多条 Jenkins 流水线。
     */
    @Test
    void shouldAllowMultipleJenkinsBindingsForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("多流水线项目", "王五", "进行中", "验证一个项目支持多条 Jenkins 绑定"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("job-one");
        mockFetchJob("job-two");

        ProjectPipelineBindingSummary firstBinding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-one",
                "main",
                "{\"ENV\":\"test\"}",
                true
        ));
        ProjectPipelineBindingSummary secondBinding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-two",
                "develop",
                "{\"ENV\":\"prod\"}",
                true
        ));

        assertThat(firstBinding.projectId()).isEqualTo(project.getId());
        assertThat(secondBinding.projectId()).isEqualTo(project.getId());
        assertThat(projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(project.getId()))
                .extracting(ProjectPipelineBindingEntity::getJobName)
                .containsExactly("job-one", "job-two");
    }

    /**
     * 验证项目级触发会遍历同一项目下的全部 Jenkins 绑定，而不是只触发首条记录。
     */
    @Test
    void shouldTriggerAllBindingsForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("批量触发项目", "赵六", "进行中", "验证项目级 Jenkins 多绑定触发"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("job-one");
        mockFetchJob("job-two");
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("job-one"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/1", "已提交 Jenkins 构建请求"));
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("job-two"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/2", "已提交 Jenkins 构建请求"));

        cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-one",
                "main",
                "{\"ENV\":\"test\"}",
                true
        ));
        cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-two",
                "develop",
                "{\"ENV\":\"prod\"}",
                true
        ));

        CicdManagementService.PipelineTriggerOutcome outcome = cicdManagementService.tryTriggerProjectPipeline(
                project.getId(),
                "release",
                "测试触发"
        );

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.message()).isEqualTo("已触发 2 条流水线");
        assertThat(outcome.bindingOutcomes())
                .extracting(CicdManagementService.PipelineBindingOutcome::jobName)
                .containsExactly("job-one", "job-two");
        assertThat(projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(project.getId()))
                .extracting(ProjectPipelineBindingEntity::getLastTriggerStatus)
                .containsExactly("QUEUED", "QUEUED");
        verify(jenkinsApiService, times(2)).triggerJob(anyString(), anyString(), anyString(), anyString(), anyMap());
    }

    /**
     * 验证默认分支不会被强行注入到未声明 branch 参数的 Jenkins Job 中，
     * 避免普通 Job 被误判为参数化构建后触发 500。
     */
    @Test
    void shouldNotInjectDefaultBranchForJobWithoutBranchParameter() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("默认分支回退项目", "钱七", "进行中", "验证普通 Job 不自动注入 branch 参数"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("plain-job");
        ProjectPipelineBindingSummary binding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "plain-job",
                "main",
                "",
                true
        ));
        clearInvocations(jenkinsApiService);
        mockFetchJob("plain-job");
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("plain-job"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/plain-job", "已提交 Jenkins 构建请求"));

        cicdManagementService.triggerPipelineBuild(binding.id());

        ArgumentCaptor<java.util.Map<String, String>> parameterCaptor = ArgumentCaptor.forClass(java.util.Map.class);
        verify(jenkinsApiService).triggerJob(anyString(), anyString(), anyString(), eq("plain-job"), parameterCaptor.capture());
        assertThat(parameterCaptor.getValue()).isEmpty();
    }

    /**
     * 验证当 Jenkins Job 显式声明了 BRANCH 参数时，平台会把默认分支注入到对应参数名中。
     */
    @Test
    void shouldInjectDefaultBranchIntoDeclaredBranchParameter() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("参数化分支项目", "孙八", "进行中", "验证 branch 参数自动映射"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("branch-job", java.util.List.of("BRANCH"));
        ProjectPipelineBindingSummary binding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "branch-job",
                "release",
                "",
                true
        ));
        clearInvocations(jenkinsApiService);
        mockFetchJob("branch-job", java.util.List.of("BRANCH"));
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("branch-job"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/branch-job", "已提交 Jenkins 构建请求"));

        cicdManagementService.triggerPipelineBuild(binding.id());

        ArgumentCaptor<java.util.Map<String, String>> parameterCaptor = ArgumentCaptor.forClass(java.util.Map.class);
        verify(jenkinsApiService).triggerJob(anyString(), anyString(), anyString(), eq("branch-job"), parameterCaptor.capture());
        assertThat(parameterCaptor.getValue()).containsExactlyEntriesOf(java.util.Map.of("BRANCH", "release"));
    }

    /**
     * 新建 AI Club Pipeline 时应直接同步 Woodpecker 仓库，而不是要求先维护 Woodpecker 服务实例。
     */
    @Test
    void shouldSyncWoodpeckerRepositoryWhenCreatingAiClubPipeline() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 项目", "周九", "进行中", "验证内置 provider"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        when(woodpeckerApiService.lookupRepository("group/repo"))
                .thenReturn(Optional.empty());
        when(woodpeckerApiService.activateRepository("1001"))
                .thenReturn(new WoodpeckerApiService.WoodpeckerRepository(
                        77L,
                        "1001",
                        "group",
                        "repo",
                        "group/repo",
                        "http://gitlab.example.com/group/repo",
                        "http://gitlab.example.com/group/repo.git",
                        "main",
                        ".woodpecker.yml",
                        true
                ));

        AiClubPipelineSummary summary = cicdManagementService.createAiClubPipeline(new AiClubPipelineRequest(
                project.getId(),
                gitlabBinding.getId(),
                "后端发布",
                "main",
                ".woodpecker.yml",
                true
        ));

        assertThat(summary.providerCode()).isEqualTo("WOODPECKER");
        assertThat(summary.woodpeckerRepoId()).isEqualTo(77L);
        assertThat(summary.woodpeckerRepoFullName()).isEqualTo("group/repo");
        assertThat(aiClubPipelineRepository.findById(summary.id()).orElseThrow().getWoodpeckerRepoId()).isEqualTo(77L);
    }

    /**
     * AI Club Pipeline 触发成功后应记录最近运行摘要，供流水线中心和首页快速构建展示。
     */
    @Test
    void shouldTriggerAiClubPipelineThroughWoodpeckerProvider() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 触发项目", "吴十", "进行中", "验证内置触发"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(true);
        when(woodpeckerApiService.triggerPipeline(eq(77L), eq("main"), anyMap()))
                .thenReturn(new WoodpeckerApiService.WoodpeckerPipeline(
                        9001L,
                        12,
                        "pending",
                        "main",
                        "manual",
                        "manual run",
                        "abc123",
                        "http://woodpecker.example.com/repos/group/repo/pipeline/12",
                        LocalDateTime.now(),
                        null,
                        null,
                        java.util.List.of()
                ));

        AiClubPipelineTriggerResult result = cicdManagementService.triggerAiClubPipeline(pipeline.getId());

        assertThat(result.pipelineName()).isEqualTo("后端发布");
        assertThat(result.runNumber()).isEqualTo(12);
        assertThat(result.status()).isEqualTo("pending");
        AiClubPipelineEntity reloaded = aiClubPipelineRepository.findById(pipeline.getId()).orElseThrow();
        assertThat(reloaded.getLastRunStatus()).isEqualTo("pending");
        assertThat(reloaded.getLastRunNumber()).isEqualTo(12);
    }

    /**
     * Woodpecker 触发失败时要落下失败摘要，便于页面直接提示当前 provider 状态。
     */
    @Test
    void shouldRecordFailedStatusWhenWoodpeckerTriggerFails() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 失败项目", "郑十一", "进行中", "验证失败摘要"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(true);
        when(woodpeckerApiService.triggerPipeline(eq(77L), eq("main"), anyMap()))
                .thenThrow(new IllegalStateException("Woodpecker API 错误: forbidden"));

        assertThatThrownBy(() -> cicdManagementService.triggerAiClubPipeline(pipeline.getId()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("forbidden");

        AiClubPipelineEntity reloaded = aiClubPipelineRepository.findById(pipeline.getId()).orElseThrow();
        assertThat(reloaded.getLastRunStatus()).isEqualTo("FAILED");
        assertThat(reloaded.getLastRunMessage()).contains("forbidden");
    }

    /**
     * 仓库同步成功不等于流水线配置完成；触发前必须确认目标分支存在配置文件。
     */
    @Test
    void shouldRejectAiClubPipelineTriggerWhenConfigFileMissing() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 未配置项目", "冯十二", "进行中", "验证配置文件前置校验"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(false);

        assertThatThrownBy(() -> cicdManagementService.triggerAiClubPipeline(pipeline.getId()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("尚未配置流水线文件 .woodpecker.yml");

        AiClubPipelineEntity reloaded = aiClubPipelineRepository.findById(pipeline.getId()).orElseThrow();
        assertThat(reloaded.getLastRunStatus()).isEqualTo("FAILED");
        assertThat(reloaded.getLastRunMessage()).contains("尚未配置流水线文件 .woodpecker.yml");
        verify(woodpeckerApiService, never()).triggerPipeline(eq(77L), anyString(), anyMap());
    }

    /**
     * 内置模板首版固定覆盖常见后端、前端、镜像和通用 Shell 场景。
     */
    @Test
    void shouldListBuiltInAiClubPipelineConfigTemplates() {
        List<AiClubPipelineConfigTemplateItem> templates = cicdManagementService.listAiClubPipelineConfigTemplates();

        assertThat(templates)
                .extracting(AiClubPipelineConfigTemplateItem::code)
                .containsExactly("JAVA_MAVEN", "NODE_VITE", "PYTHON_FASTAPI", "DOCKER_BUILDX", "SSH_REMOTE", "GENERIC_SHELL");
        assertThat(templates)
                .allSatisfy(template -> {
                    assertThat(template.defaultConfigPath()).isEqualTo(".woodpecker.yml");
                    assertThat(template.contentPreview()).contains("steps:").contains("image:");
                    assertThat(template.parameters()).isNotEmpty();
                    assertThat(template.parameters()).extracting("key").contains("branch");
                    if (!"SSH_REMOTE".equals(template.code())) {
                        assertThat(template.parameters()).extracting("key").contains("projectRoot", "serverDeployEnabled");
                    }
                    if ("DOCKER_BUILDX".equals(template.code())) {
                        assertThat(template.contentPreview())
                                .contains("woodpeckerci/plugin-docker-buildx")
                                .contains("settings:")
                                .contains("from_secret: AI_CLUB_PIPELINE_REGISTRY_USERNAME");
                    } else if ("SSH_REMOTE".equals(template.code())) {
                        assertThat(template.contentPreview())
                                .contains("SSH_PRIVATE_KEY")
                                .contains("ssh-deploy");
                    } else {
                        assertThat(template.contentPreview()).contains("commands:");
                    }
                });
    }

    /**
     * 配置状态查询会直接反映目标分支是否已经提交 Woodpecker YAML。
     */
    @Test
    void shouldReportAiClubPipelineConfigStatus() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 状态项目", "曹十三", "进行中", "验证配置状态"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(true);

        AiClubPipelineConfigStatusItem status = cicdManagementService.getAiClubPipelineConfigStatus(pipeline.getId());

        assertThat(status.status()).isEqualTo("PRESENT");
        assertThat(status.branch()).isEqualTo("main");
        assertThat(status.configPath()).isEqualTo(".woodpecker.yml");
    }

    /**
     * GitLab 查询失败时状态降级为 UNKNOWN，避免列表页因为单仓库异常整体不可用。
     */
    @Test
    void shouldReportUnknownWhenAiClubPipelineConfigStatusCheckFails() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 未知项目", "陈十四", "进行中", "验证状态降级"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenThrow(new IllegalStateException("GitLab API 错误: timeout"));

        AiClubPipelineConfigStatusItem status = cicdManagementService.getAiClubPipelineConfigStatus(pipeline.getId());

        assertThat(status.status()).isEqualTo("UNKNOWN");
        assertThat(status.message()).contains("timeout");
    }

    /**
     * 详情页会复用与列表相同的摘要字段，不额外暴露新的 provider 视图模型。
     */
    @Test
    void shouldGetAiClubPipelineDetail() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 详情项目", "钱十五", "进行中", "验证详情读取"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));

        AiClubPipelineSummary result = cicdManagementService.getAiClubPipeline(pipeline.getId());

        assertThat(result.id()).isEqualTo(pipeline.getId());
        assertThat(result.projectName()).isEqualTo("Woodpecker 详情项目");
        assertThat(result.name()).isEqualTo("后端发布");
        assertThat(result.gitlabProjectPath()).isEqualTo("group/repo");
        assertThat(result.providerCode()).isEqualTo(AiClubPipelineEntity.PROVIDER_WOODPECKER);
    }

    /**
     * 预览会按流水线默认分支渲染模板 YAML，供前端展示后继续微调。
     */
    @Test
    void shouldPreviewAiClubPipelineConfigTemplate() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 预览项目", "李十五", "进行中", "验证模板预览"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));

        AiClubPipelineConfigPreviewResult result = cicdManagementService.previewAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigPreviewRequest("NODE_VITE", Map.of(
                        "branch", "release/1.0",
                        "projectRoot", "frontend/app",
                        "buildCommand", "npm run test\nnpm run build"
                ), false, null)
        );

        assertThat(result.templateCode()).isEqualTo("NODE_VITE");
        assertThat(result.branch()).isEqualTo("main");
        assertThat(result.configPath()).isEqualTo(".woodpecker.yml");
        assertThat(result.content())
                .contains("node:20-alpine")
                .contains("cd 'frontend/app'")
                .contains("npm run test")
                .contains("npm run build")
                .contains("branch: \"release/1.0\"");
    }

    /**
     * 补全配置通过新分支和 MR 交付，避免平台直接覆盖目标分支。
     */
    @Test
    void shouldCompleteAiClubPipelineConfigByCreatingMergeRequest() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 补全项目", "韩十六", "进行中", "验证补全 MR"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(false);
        when(gitlabApiService.createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                org.mockito.ArgumentMatchers.<List<GitlabApiService.GitlabCommitAction>>any()
        )).thenReturn(new GitlabApiService.GitlabCreatedCommit(
                "commit-1",
                "c1",
                "ci: add AI Club Pipeline config",
                "http://gitlab.example.com/group/repo/-/commit/commit-1"
        ));
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("main"),
                eq("ci: add AI Club Pipeline config for 后端发布"),
                org.mockito.ArgumentMatchers.contains("AI Club Pipeline 配置文件补全 MR")
        )).thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                8L,
                "ci: add AI Club Pipeline config for 后端发布",
                "ai-club/pipeline-config/1-20260101010101",
                "main",
                "opened",
                "http://gitlab.example.com/group/repo/-/merge_requests/8",
                "2026-01-01T00:00:00Z"
        ));

        AiClubPipelineConfigCompleteResult result = cicdManagementService.completeAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigCompleteRequest(
                        "JAVA_MAVEN",
                        Map.of(),
                        true,
                        "steps:\n  - name: test\n    image: maven:3.9-eclipse-temurin-17\n    commands:\n      - mvn test\n"
                )
        );

        assertThat(result.branchName()).startsWith("ai-club/pipeline-config/");
        assertThat(result.commitId()).isEqualTo("commit-1");
        assertThat(result.mergeRequestIid()).isEqualTo(8L);
        assertThat(result.mergeRequestUrl()).contains("/merge_requests/8");
        verify(gitlabApiService).createBranch(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("main")
        );
    }

    /**
     * 普通用户通过页面参数生成 YAML，后端按参数重新渲染，不使用前端传入的手写内容。
     */
    @Test
    @SuppressWarnings("unchecked")
    void shouldCompleteAiClubPipelineConfigWithTemplateParameters() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 参数项目", "朱二十", "进行中", "验证参数化补全"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(false);
        when(gitlabApiService.createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                org.mockito.ArgumentMatchers.<List<GitlabApiService.GitlabCommitAction>>any()
        )).thenReturn(new GitlabApiService.GitlabCreatedCommit(
                "commit-2",
                "c2",
                "ci: add AI Club Pipeline config",
                "http://gitlab.example.com/group/repo/-/commit/commit-2"
        ));
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("main"),
                eq("ci: add AI Club Pipeline config for 后端发布"),
                org.mockito.ArgumentMatchers.contains("AI Club Pipeline 配置文件补全 MR")
        )).thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                9L,
                "ci: add AI Club Pipeline config for 后端发布",
                "ai-club/pipeline-config/1-20260101010101",
                "main",
                "opened",
                "http://gitlab.example.com/group/repo/-/merge_requests/9",
                "2026-01-01T00:00:00Z"
        ));

        cicdManagementService.completeAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigCompleteRequest(
                        "NODE_VITE",
                        Map.of("branch", "release/1.0", "buildCommand", "npm run test\nnpm run build"),
                        false,
                        "steps:\n  - name: forged\n"
                )
        );

        ArgumentCaptor<List<GitlabApiService.GitlabCommitAction>> actionsCaptor = ArgumentCaptor.forClass((Class) List.class);
        verify(gitlabApiService).createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                actionsCaptor.capture()
        );
        assertThat(actionsCaptor.getValue()).singleElement().satisfies(action -> {
            assertThat(action.content()).contains("npm run test").contains("branch: \"release/1.0\"");
            assertThat(action.content()).doesNotContain("forged");
        });
    }

    /**
     * Docker 推送模板由页面参数生成 registry / repo，并在创建 MR 前写入 Woodpecker secrets。
     */
    @Test
    @SuppressWarnings("unchecked")
    void shouldCompleteDockerTemplateWithPageParametersAndSecrets() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 镜像项目", "许二十一", "进行中", "验证镜像参数"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(false);
        when(gitlabApiService.createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                org.mockito.ArgumentMatchers.<List<GitlabApiService.GitlabCommitAction>>any()
        )).thenReturn(new GitlabApiService.GitlabCreatedCommit(
                "commit-3",
                "c3",
                "ci: add AI Club Pipeline config",
                "http://gitlab.example.com/group/repo/-/commit/commit-3"
        ));
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("main"),
                eq("ci: add AI Club Pipeline config for 后端发布"),
                org.mockito.ArgumentMatchers.contains("AI Club Pipeline 配置文件补全 MR")
        )).thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                10L,
                "ci: add AI Club Pipeline config for 后端发布",
                "ai-club/pipeline-config/1-20260101010101",
                "main",
                "opened",
                "http://gitlab.example.com/group/repo/-/merge_requests/10",
                "2026-01-01T00:00:00Z"
        ));

        cicdManagementService.completeAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigCompleteRequest(
                        "DOCKER_BUILDX",
                        Map.of(
                                "registryUrl", "registry.example.com",
                                "registryUsername", "robot",
                                "registryPassword", "secret-token",
                                "tags", "latest\n${CI_COMMIT_SHA}"
                        ),
                        false,
                        null
                )
        );

        verify(woodpeckerApiService).upsertRepositorySecret(
                eq(77L),
                eq("AI_CLUB_PIPELINE_" + pipeline.getId() + "_REGISTRY_USERNAME"),
                eq("robot"),
                anyString(),
                eq(List.of("push", "manual", "tag")),
                eq(List.of("woodpeckerci/plugin-docker-buildx", "woodpeckerci/plugin-docker-buildx:2"))
        );
        verify(woodpeckerApiService).upsertRepositorySecret(
                eq(77L),
                eq("AI_CLUB_PIPELINE_" + pipeline.getId() + "_REGISTRY_PASSWORD"),
                eq("secret-token"),
                anyString(),
                eq(List.of("push", "manual", "tag")),
                eq(List.of("woodpeckerci/plugin-docker-buildx", "woodpeckerci/plugin-docker-buildx:2"))
        );

        ArgumentCaptor<List<GitlabApiService.GitlabCommitAction>> actionsCaptor = ArgumentCaptor.forClass((Class) List.class);
        verify(gitlabApiService).createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                actionsCaptor.capture()
        );
        assertThat(actionsCaptor.getValue()).singleElement().satisfies(action -> assertThat(action.content())
                .contains("woodpeckerci/plugin-docker-buildx:2")
                .contains("registry: \"registry.example.com\"")
                .contains("repo: \"registry.example.com/group/repo\"")
                .contains("from_secret: AI_CLUB_PIPELINE_" + pipeline.getId() + "_REGISTRY_USERNAME")
                .contains("from_secret: AI_CLUB_PIPELINE_" + pipeline.getId() + "_REGISTRY_PASSWORD")
        );
    }

    /**
     * Java 构建并部署模板会在打包后上传产物到服务器，并通过 SSH 执行远程重启命令。
     */
    @Test
    @SuppressWarnings("unchecked")
    void shouldCompleteJavaMavenWithServerDeployPostAction() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker Java 部署项目", "吴二十二", "进行中", "验证 Java 构建部署模板"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(false);
        when(gitlabApiService.createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                org.mockito.ArgumentMatchers.<List<GitlabApiService.GitlabCommitAction>>any()
        )).thenReturn(new GitlabApiService.GitlabCreatedCommit(
                "commit-4",
                "c4",
                "ci: add AI Club Pipeline config",
                "http://gitlab.example.com/group/repo/-/commit/commit-4"
        ));
        when(gitlabApiService.createMergeRequest(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("main"),
                eq("ci: add AI Club Pipeline config for 后端发布"),
                org.mockito.ArgumentMatchers.contains("AI Club Pipeline 配置文件补全 MR")
        )).thenReturn(new GitlabApiService.GitlabCreatedMergeRequest(
                11L,
                "ci: add AI Club Pipeline config for 后端发布",
                "ai-club/pipeline-config/1-20260101010101",
                "main",
                "opened",
                "http://gitlab.example.com/group/repo/-/merge_requests/11",
                "2026-01-01T00:00:00Z"
        ));

        cicdManagementService.completeAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigCompleteRequest(
                        "JAVA_MAVEN",
                        Map.of(
                                "projectRoot", "services/api",
                                "serverDeployEnabled", "true",
                                "serverDeployHost", "deploy.example.com",
                                "serverDeployUser", "deploy",
                                "serverDeployPrivateKey", "private-key",
                                "serverDeploySourcePath", "target/*.jar",
                                "serverDeployRemotePath", "/srv/app/app.jar",
                                "serverDeployCommands", "cd /srv/app\n./restart.sh"
                        ),
                        false,
                        null
                )
        );

        verify(woodpeckerApiService).upsertRepositorySecret(
                eq(77L),
                eq("AI_CLUB_PIPELINE_" + pipeline.getId() + "_SERVER_DEPLOY_SSH_PRIVATE_KEY"),
                eq("private-key"),
                anyString(),
                eq(List.of("push", "manual", "tag")),
                eq(List.of("alpine", "alpine:3.20"))
        );

        ArgumentCaptor<List<GitlabApiService.GitlabCommitAction>> actionsCaptor = ArgumentCaptor.forClass((Class) List.class);
        verify(gitlabApiService).createCommit(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                startsWith("ai-club/pipeline-config/"),
                eq("ci: add AI Club Pipeline config"),
                actionsCaptor.capture()
        );
        assertThat(actionsCaptor.getValue()).singleElement().satisfies(action -> assertThat(action.content())
                .contains("cd 'services/api'")
                .contains("name: deploy")
                .contains("DEPLOY_SOURCE='services/api/target/*.jar'")
                .contains("scp -i ~/.ssh/id_ai_club -P 22")
                .contains("deploy@deploy.example.com:/srv/app/app.jar")
                .contains("from_secret: AI_CLUB_PIPELINE_" + pipeline.getId() + "_SERVER_DEPLOY_SSH_PRIVATE_KEY")
                .contains("./restart.sh")
        );
    }

    /**
     * 已存在配置文件时拒绝补全，防止平台模板覆盖仓库内已有流水线定义。
     */
    @Test
    void shouldRejectConfigCompletionWhenTargetFileExists() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("Woodpecker 已配置项目", "周十七", "进行中", "验证不覆盖已有配置"));
        ProjectGitlabBindingEntity gitlabBinding = projectGitlabBindingRepository.save(createGitlabBinding(project));
        AiClubPipelineEntity pipeline = aiClubPipelineRepository.save(createAiClubPipeline(project, gitlabBinding));
        when(gitlabApiService.repositoryFileExists(
                eq("http://gitlab.example.com/api/v4"),
                anyString(),
                eq("group/repo"),
                eq("main"),
                eq(".woodpecker.yml")
        )).thenReturn(true);

        assertThatThrownBy(() -> cicdManagementService.completeAiClubPipelineConfig(
                pipeline.getId(),
                new AiClubPipelineConfigCompleteRequest(
                        "GENERIC_SHELL",
                        Map.of(),
                        true,
                        "steps:\n  - name: verify\n    image: alpine\n    commands:\n      - ls\n"
                )
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不会覆盖已有配置");

        verify(gitlabApiService, never()).createBranch(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    /**
     * 创建测试用 Jenkins 服务，复用真实的加密与持久化流程。
     */
    private JenkinsServerSummary createJenkinsServer() {
        return cicdManagementService.createJenkinsServer(new JenkinsServerRequest(
                "测试 Jenkins",
                "http://jenkins.example.com",
                "tester",
                "token-value",
                "测试 Jenkins 服务",
                true
        ));
    }

    /**
     * 模拟 Jenkins 查询 Job 详情，避免测试依赖外部 Jenkins 服务。
     */
    private void mockFetchJob(String jobName) {
        mockFetchJob(jobName, java.util.List.of());
    }

    /**
     * 模拟 Jenkins 查询 Job 详情，并按需返回参数定义。
     */
    private void mockFetchJob(String jobName, java.util.List<String> parameterNames) {
        when(jenkinsApiService.fetchJob(anyString(), anyString(), anyString(), eq(jobName)))
                .thenReturn(new JenkinsApiService.JenkinsJob(
                        jobName,
                        jobName,
                        "http://jenkins.example.com/job/" + jobName,
                        "blue",
                        null,
                        parameterNames
                ));
    }

    private ProjectGitlabBindingEntity createGitlabBinding(ProjectEntity project) {
        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setProject(project);
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabProjectRef("group/repo");
        binding.setGitlabProjectId("1001");
        binding.setGitlabProjectName("repo");
        binding.setGitlabProjectPath("group/repo");
        binding.setGitlabProjectWebUrl("http://gitlab.example.com/group/repo");
        binding.setDefaultTargetBranch("main");
        binding.setTokenCiphertext(tokenCipherService.encrypt("gitlab-token"));
        binding.setEnabled(true);
        return binding;
    }

    private AiClubPipelineEntity createAiClubPipeline(ProjectEntity project, ProjectGitlabBindingEntity gitlabBinding) {
        AiClubPipelineEntity pipeline = new AiClubPipelineEntity();
        pipeline.setProject(project);
        pipeline.setGitlabBinding(gitlabBinding);
        pipeline.setName("后端发布");
        pipeline.setProviderCode(AiClubPipelineEntity.PROVIDER_WOODPECKER);
        pipeline.setDefaultBranch("main");
        pipeline.setConfigPath(".woodpecker.yml");
        pipeline.setWoodpeckerRepoId(77L);
        pipeline.setWoodpeckerRepoFullName("group/repo");
        pipeline.setWoodpeckerRepoUrl("http://gitlab.example.com/group/repo");
        pipeline.setEnabled(true);
        return pipeline;
    }
}
