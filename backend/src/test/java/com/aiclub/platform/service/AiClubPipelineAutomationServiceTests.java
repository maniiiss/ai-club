package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiClubPipelineCallbackDeliveryEntity;
import com.aiclub.platform.domain.model.AiClubPipelineCallbackWebhookEntity;
import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.AiClubPipelineRunSnapshotEntity;
import com.aiclub.platform.domain.model.AiClubPipelineTriggerWebhookEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.request.AiClubPipelineCallbackWebhookRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCronRequest;
import com.aiclub.platform.repository.AiClubPipelineCallbackDeliveryRepository;
import com.aiclub.platform.repository.AiClubPipelineCallbackWebhookRepository;
import com.aiclub.platform.repository.AiClubPipelineCronJobRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.AiClubPipelineRunSnapshotRepository;
import com.aiclub.platform.repository.AiClubPipelineTriggerWebhookRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiClubPipelineAutomationServiceTests {

    @Mock
    private AiClubPipelineRepository aiClubPipelineRepository;

    @Mock
    private AiClubPipelineCronJobRepository cronJobRepository;

    @Mock
    private AiClubPipelineTriggerWebhookRepository triggerWebhookRepository;

    @Mock
    private AiClubPipelineCallbackWebhookRepository callbackWebhookRepository;

    @Mock
    private AiClubPipelineRunSnapshotRepository runSnapshotRepository;

    @Mock
    private AiClubPipelineCallbackDeliveryRepository callbackDeliveryRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private WoodpeckerApiService woodpeckerApiService;

    @Mock
    private WoodpeckerPipelineProvider woodpeckerPipelineProvider;

    @Mock
    private GitlabApiService gitlabApiService;

    private AiClubPipelineAutomationService automationService;

    @BeforeEach
    void setUp() {
        automationService = new AiClubPipelineAutomationService(
                aiClubPipelineRepository,
                cronJobRepository,
                triggerWebhookRepository,
                callbackWebhookRepository,
                runSnapshotRepository,
                callbackDeliveryRepository,
                projectDataPermissionService,
                tokenCipherService,
                woodpeckerApiService,
                woodpeckerPipelineProvider,
                gitlabApiService,
                new ObjectMapper(),
                new CicdAutomationProperties("", 30000L, 10, 10000L, 3)
        );
    }

    /**
     * 非法 Cron 应在本地校验阶段直接拒绝，避免把错误表达式写到远端 Woodpecker。
     */
    @Test
    void shouldRejectInvalidCronExpressionBeforeCallingWoodpecker() {
        AiClubPipelineEntity pipeline = createPipeline();
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(aiClubPipelineRepository.findById(1L)).thenReturn(Optional.of(pipeline));

        assertThatThrownBy(() -> automationService.createCronJob(1L, new AiClubPipelineCronRequest(
                "夜间构建",
                "main",
                "invalid-cron",
                true
        )))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Cron 表达式格式不正确");

        verify(woodpeckerApiService, never()).createCron(any(), any(), any(), any());
    }

    /**
     * 公开触发 webhook 必须校验 token，错误 token 不能继续进入触发链路。
     */
    @Test
    void shouldRejectTriggerWebhookWhenTokenDoesNotMatch() {
        AiClubPipelineEntity pipeline = createPipeline();
        AiClubPipelineTriggerWebhookEntity webhook = new AiClubPipelineTriggerWebhookEntity();
        webhook.setPipeline(pipeline);
        webhook.setEnabled(true);
        webhook.setTokenCiphertext("cipher");
        when(aiClubPipelineRepository.findById(1L)).thenReturn(Optional.of(pipeline));
        when(triggerWebhookRepository.findByPipeline_Id(1L)).thenReturn(Optional.of(webhook));
        when(tokenCipherService.decrypt("cipher")).thenReturn("expected-token");

        assertThatThrownBy(() -> automationService.validateTriggerWebhookAccess(1L, "wrong-token"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("token 不正确");
    }

    /**
     * 已存在的回调地址在用户只修改状态订阅时应继续保留，不要求每次重新输入完整 URL。
     */
    @Test
    void shouldKeepExistingCallbackUrlWhenUpdatingStatusesOnly() {
        AiClubPipelineEntity pipeline = createPipeline();
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        AiClubPipelineCallbackWebhookEntity webhook = new AiClubPipelineCallbackWebhookEntity();
        webhook.setPipeline(pipeline);
        webhook.setCallbackUrlCiphertext("encrypted-url");
        webhook.setSubscribedStatusesJson("[\"SUCCESS\"]");
        when(aiClubPipelineRepository.findById(1L)).thenReturn(Optional.of(pipeline));
        when(callbackWebhookRepository.findByPipeline_Id(1L)).thenReturn(Optional.of(webhook));
        when(callbackWebhookRepository.save(any(AiClubPipelineCallbackWebhookEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        automationService.updateCallbackWebhook(1L, new AiClubPipelineCallbackWebhookRequest(
                true,
                "",
                List.of("FAILED", "CANCELED")
        ));

        ArgumentCaptor<AiClubPipelineCallbackWebhookEntity> captor = ArgumentCaptor.forClass(AiClubPipelineCallbackWebhookEntity.class);
        verify(callbackWebhookRepository).save(captor.capture());
        assertThat(captor.getValue().getCallbackUrlCiphertext()).isEqualTo("encrypted-url");
        assertThat(captor.getValue().getSubscribedStatusesJson()).contains("FAILED");
        assertThat(captor.getValue().getSubscribedStatusesJson()).contains("CANCELED");
    }

    /**
     * 当运行状态进入订阅状态时，应创建一条待发送的 callback delivery，用于后续异步回调。
     */
    @Test
    void shouldCreatePendingCallbackDeliveryWhenRunStatusMatchesSubscription() {
        AiClubPipelineEntity pipeline = createPipeline();
        AiClubPipelineCallbackWebhookEntity webhook = new AiClubPipelineCallbackWebhookEntity();
        webhook.setId(9L);
        webhook.setPipeline(pipeline);
        webhook.setEnabled(true);
        webhook.setCallbackUrlCiphertext("callback-cipher");
        webhook.setSubscribedStatusesJson("[\"SUCCESS\"]");
        when(callbackWebhookRepository.findByPipeline_Id(1L)).thenReturn(Optional.of(webhook));
        when(runSnapshotRepository.findByPipeline_IdAndRunNumber(1L, 77)).thenReturn(Optional.empty());
        when(runSnapshotRepository.save(any(AiClubPipelineRunSnapshotEntity.class))).thenAnswer(invocation -> {
            AiClubPipelineRunSnapshotEntity snapshot = invocation.getArgument(0);
            snapshot.setId(101L);
            return snapshot;
        });
        when(callbackDeliveryRepository.findByRunSnapshot_IdAndCallbackStatus(101L, "SUCCESS")).thenReturn(Optional.empty());
        when(woodpeckerPipelineProvider.resolveRunUrl(eq(pipeline), any(WoodpeckerApiService.WoodpeckerPipeline.class)))
                .thenReturn("http://woodpecker.example.com/repos/group/repo/pipeline/77");

        automationService.recordTriggeredRun(
                pipeline,
                new WoodpeckerApiService.WoodpeckerPipeline(
                        501L,
                        77,
                        "SUCCESS",
                        "main",
                        "manual",
                        "构建成功",
                        "abcdef",
                        null,
                        LocalDateTime.of(2026, 5, 28, 10, 0),
                        LocalDateTime.of(2026, 5, 28, 10, 1),
                        LocalDateTime.of(2026, 5, 28, 10, 2),
                        List.of()
                ),
                "手动触发"
        );

        ArgumentCaptor<AiClubPipelineCallbackDeliveryEntity> captor = ArgumentCaptor.forClass(AiClubPipelineCallbackDeliveryEntity.class);
        verify(callbackDeliveryRepository).save(captor.capture());
        assertThat(captor.getValue().getCallbackStatus()).isEqualTo("SUCCESS");
        assertThat(captor.getValue().getDeliveryStatus()).isEqualTo(AiClubPipelineCallbackDeliveryEntity.STATUS_PENDING);
        assertThat(captor.getValue().getPayloadJson()).contains("\"triggerSource\":\"手动触发\"");
    }

    private AiClubPipelineEntity createPipeline() {
        ProjectEntity project = new ProjectEntity("自动化项目", "测试负责人", "进行中", "用于验证流水线自动化配置");
        project.setId(11L);
        ProjectGitlabBindingEntity gitlabBinding = new ProjectGitlabBindingEntity();
        gitlabBinding.setId(21L);
        gitlabBinding.setProject(project);
        gitlabBinding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        gitlabBinding.setGitlabProjectRef("group/repo");
        gitlabBinding.setGitlabProjectPath("group/repo");
        gitlabBinding.setTokenCiphertext("gitlab-token-cipher");
        gitlabBinding.setEnabled(true);

        AiClubPipelineEntity pipeline = new AiClubPipelineEntity();
        pipeline.setId(1L);
        pipeline.setProject(project);
        pipeline.setGitlabBinding(gitlabBinding);
        pipeline.setName("发布流水线");
        pipeline.setProviderCode(AiClubPipelineEntity.PROVIDER_WOODPECKER);
        pipeline.setDefaultBranch("main");
        pipeline.setConfigPath(".woodpecker.yml");
        pipeline.setWoodpeckerRepoId(301L);
        pipeline.setWoodpeckerRepoFullName("group/repo");
        pipeline.setEnabled(true);
        return pipeline;
    }
}
