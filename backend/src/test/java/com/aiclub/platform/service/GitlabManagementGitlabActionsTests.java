package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.GitlabBranchSummary;
import com.aiclub.platform.dto.GitlabCreateMergeRequestResult;
import com.aiclub.platform.dto.GitlabTagCreateResult;
import com.aiclub.platform.dto.request.GitlabCreateMergeRequestRequest;
import com.aiclub.platform.dto.request.GitlabTagCreateRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.ProjectGitlabBindingRepository;
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
    private GitlabAutoMergeLogRepository autoMergeLogRepository;

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

    private GitlabManagementService gitlabManagementService;

    @BeforeEach
    void setUp() {
        gitlabManagementService = new GitlabManagementService(
                projectRepository,
                bindingRepository,
                autoMergeConfigRepository,
                autoMergeLogRepository,
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
                "http://gitlab.example.com/api/v4"
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
                .thenReturn(List.of(new GitlabApiService.GitlabBranch("main", true, true, false, "http://gitlab.example.com/group/demo-repo/-/branches/main")));

        List<GitlabBranchSummary> branches = gitlabManagementService.listBindingBranches(1L, "main");

        assertThat(branches).hasSize(1);
        assertThat(branches.get(0).name()).isEqualTo("main");
        assertThat(branches.get(0).defaultBranch()).isTrue();
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
        binding.setTokenCiphertext("cipher-token");
        binding.setEnabled(true);
        return binding;
    }
}
