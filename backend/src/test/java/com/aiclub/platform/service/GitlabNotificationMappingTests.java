package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.GitlabAutoMergeConfigRepository;
import com.aiclub.platform.repository.GitlabCodeStructureSnapshotRepository;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
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
import java.util.concurrent.Executor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.Mockito.verify;

/**
 * 覆盖 GitLab 自动合并日志转消息中心通知时的 bizType、级别与文案映射。
 */
@ExtendWith(MockitoExtension.class)
class GitlabNotificationMappingTests {

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
                platformEnvVarResolver,
                new ObjectMapper(),
                "http://gitlab.example.com/api/v4",
                transactionManager,
                executionTaskExecutor
        );
    }

    /**
     * AI 审核拒绝时，应映射成 ERROR 级别和专用的 GITLAB_AI_REJECTED bizType。
     */
    @Test
    void shouldMapAiRejectedLogToDedicatedNotification() {
        ReflectionTestUtils.invokeMethod(gitlabManagementService, "notifyMergeRequestAuthor", buildLog(
                101L,
                "AI_REJECTED",
                "AI 审核判定存在严重缺陷"
        ));

        verify(notificationService).sendToGitlabUser(
                "alice",
                NotificationService.TYPE_GITLAB,
                NotificationService.LEVEL_ERROR,
                "MR !23 被 AI 审核拒绝",
                "《登录优化》未通过 AI 审核，原因：AI 审核判定存在严重缺陷",
                "/gitlab",
                "GITLAB_AI_REJECTED",
                101L
        );
    }

    /**
     * 分支落后属于跳过待处理，但消息中心里要明确告诉作者需要先 rebase。
     */
    @Test
    void shouldMapBranchBehindLogToWarningNotification() {
        ReflectionTestUtils.invokeMethod(gitlabManagementService, "notifyMergeRequestAuthor", buildLog(
                102L,
                "SKIPPED",
                "源分支落后于目标分支，当前 Merge Request 需要先 rebase/同步后再自动合并"
        ));

        verify(notificationService).sendToGitlabUser(
                "alice",
                NotificationService.TYPE_GITLAB,
                NotificationService.LEVEL_WARNING,
                "MR !23 需先同步目标分支",
                "《登录优化》暂未自动合并，源分支落后于目标分支，请先 rebase 或同步后再试。",
                "/gitlab",
                "GITLAB_BRANCH_BEHIND",
                102L
        );
    }

    /**
     * 自动合并成功时，应使用 SUCCESS 级别和单独的成功类 bizType。
     */
    @Test
    void shouldMapMergedLogToSuccessNotification() {
        ReflectionTestUtils.invokeMethod(gitlabManagementService, "notifyMergeRequestAuthor", buildLog(
                103L,
                "MERGED",
                "自动合并成功"
        ));

        verify(notificationService).sendToGitlabUser(
                "alice",
                NotificationService.TYPE_GITLAB,
                NotificationService.LEVEL_SUCCESS,
                "MR !23 已自动合并",
                "《登录优化》已自动合并成功。",
                "/gitlab",
                "GITLAB_MERGED",
                103L
        );
    }

    /**
     * 构造通知测试共用的自动合并日志实体。
     */
    private GitlabAutoMergeLogEntity buildLog(Long id, String result, String reason) {
        GitlabAutoMergeLogEntity log = new GitlabAutoMergeLogEntity();
        log.setId(id);
        log.setMergeRequestIid(23L);
        log.setMergeRequestTitle("登录优化");
        log.setMergeRequestAuthorUsername("alice");
        log.setMergeRequestAuthorName("Alice");
        log.setResult(result);
        log.setReason(reason);
        return log;
    }
}
