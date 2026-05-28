package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiClubPipelineCallbackDeliveryEntity;
import com.aiclub.platform.domain.model.AiClubPipelineCallbackWebhookEntity;
import com.aiclub.platform.domain.model.AiClubPipelineCronJobEntity;
import com.aiclub.platform.domain.model.AiClubPipelineEntity;
import com.aiclub.platform.domain.model.AiClubPipelineRunSnapshotEntity;
import com.aiclub.platform.domain.model.AiClubPipelineTriggerWebhookEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.dto.AiClubPipelineCallbackWebhookSummary;
import com.aiclub.platform.dto.AiClubPipelineCronSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerWebhookSummary;
import com.aiclub.platform.dto.request.AiClubPipelineCallbackWebhookRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCronRequest;
import com.aiclub.platform.dto.request.AiClubPipelineTriggerWebhookRequest;
import com.aiclub.platform.repository.AiClubPipelineCallbackDeliveryRepository;
import com.aiclub.platform.repository.AiClubPipelineCallbackWebhookRepository;
import com.aiclub.platform.repository.AiClubPipelineCronJobRepository;
import com.aiclub.platform.repository.AiClubPipelineRepository;
import com.aiclub.platform.repository.AiClubPipelineRunSnapshotRepository;
import com.aiclub.platform.repository.AiClubPipelineTriggerWebhookRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * 统一承载 AI Club Pipeline 的自动化配置、运行快照同步与外部回调派发。
 * 这样详情页管理接口、公开 webhook 触发入口和后台调度器可以共用同一套规则。
 */
@Service
@Transactional(readOnly = true)
public class AiClubPipelineAutomationService {

    /** 允许用户订阅的关键运行状态。 */
    public static final List<String> SUPPORTED_CALLBACK_STATUSES = List.of(
            "CREATED",
            "PENDING",
            "QUEUED",
            "RUNNING",
            "WAITING",
            "SUCCESS",
            "FAILED",
            "CANCELED"
    );

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {
    };

    private final AiClubPipelineRepository aiClubPipelineRepository;
    private final AiClubPipelineCronJobRepository cronJobRepository;
    private final AiClubPipelineTriggerWebhookRepository triggerWebhookRepository;
    private final AiClubPipelineCallbackWebhookRepository callbackWebhookRepository;
    private final AiClubPipelineRunSnapshotRepository runSnapshotRepository;
    private final AiClubPipelineCallbackDeliveryRepository callbackDeliveryRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final TokenCipherService tokenCipherService;
    private final WoodpeckerApiService woodpeckerApiService;
    private final WoodpeckerPipelineProvider woodpeckerPipelineProvider;
    private final GitlabApiService gitlabApiService;
    private final ObjectMapper objectMapper;
    private final CicdAutomationProperties automationProperties;
    private final HttpClient httpClient;

    public AiClubPipelineAutomationService(
            AiClubPipelineRepository aiClubPipelineRepository,
            AiClubPipelineCronJobRepository cronJobRepository,
            AiClubPipelineTriggerWebhookRepository triggerWebhookRepository,
            AiClubPipelineCallbackWebhookRepository callbackWebhookRepository,
            AiClubPipelineRunSnapshotRepository runSnapshotRepository,
            AiClubPipelineCallbackDeliveryRepository callbackDeliveryRepository,
            ProjectDataPermissionService projectDataPermissionService,
            TokenCipherService tokenCipherService,
            WoodpeckerApiService woodpeckerApiService,
            WoodpeckerPipelineProvider woodpeckerPipelineProvider,
            GitlabApiService gitlabApiService,
            ObjectMapper objectMapper,
            CicdAutomationProperties automationProperties
    ) {
        this.aiClubPipelineRepository = aiClubPipelineRepository;
        this.cronJobRepository = cronJobRepository;
        this.triggerWebhookRepository = triggerWebhookRepository;
        this.callbackWebhookRepository = callbackWebhookRepository;
        this.runSnapshotRepository = runSnapshotRepository;
        this.callbackDeliveryRepository = callbackDeliveryRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.tokenCipherService = tokenCipherService;
        this.woodpeckerApiService = woodpeckerApiService;
        this.woodpeckerPipelineProvider = woodpeckerPipelineProvider;
        this.gitlabApiService = gitlabApiService;
        this.objectMapper = objectMapper;
        this.automationProperties = automationProperties;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 统计某条流水线的 cron 数量，供列表摘要展示自动化能力。
     */
    public long countCronJobs(Long pipelineId) {
        return pipelineId == null ? 0L : cronJobRepository.countByPipeline_Id(pipelineId);
    }

    /**
     * 判断公开触发 webhook 是否已启用。
     */
    public boolean isTriggerWebhookEnabled(Long pipelineId) {
        return triggerWebhookRepository.findByPipeline_Id(pipelineId)
                .map(item -> Boolean.TRUE.equals(item.getEnabled()))
                .orElse(false);
    }

    /**
     * 判断回调 webhook 是否已启用。
     */
    public boolean isCallbackWebhookEnabled(Long pipelineId) {
        return callbackWebhookRepository.findByPipeline_Id(pipelineId)
                .map(item -> Boolean.TRUE.equals(item.getEnabled()))
                .orElse(false);
    }

    /**
     * 返回详情页需要展示的回调订阅状态。
     */
    public List<String> listCallbackSubscribedStatuses(Long pipelineId) {
        return callbackWebhookRepository.findByPipeline_Id(pipelineId)
                .map(this::readSubscribedStatuses)
                .orElse(List.of());
    }

    /**
     * 列出某条流水线下的全部 cron 配置。
     */
    public List<AiClubPipelineCronSummary> listCronJobs(Long pipelineId) {
        requireVisiblePipeline(pipelineId);
        return cronJobRepository.findByPipeline_IdOrderByIdAsc(pipelineId).stream()
                .map(this::toCronSummary)
                .toList();
    }

    /**
     * 创建新的 cron，并立即同步到远端 Woodpecker。
     */
    @Transactional
    public AiClubPipelineCronSummary createCronJob(Long pipelineId, AiClubPipelineCronRequest request) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        requireWoodpeckerRepoReady(pipeline);
        String name = requireCronNameUnique(pipeline.getId(), request.name(), null);
        String cronExpression = normalizeCronExpression(request.cronExpression());
        String branch = normalizeBranch(request.branch());
        AiClubPipelineCronJobEntity entity = new AiClubPipelineCronJobEntity();
        entity.setPipeline(pipeline);
        entity.setName(name);
        entity.setBranch(branch);
        entity.setCronExpression(cronExpression);
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        applyRemoteCron(pipeline, entity);
        return toCronSummary(cronJobRepository.save(entity));
    }

    /**
     * 编辑已有 cron，并重新同步远端配置。
     */
    @Transactional
    public AiClubPipelineCronSummary updateCronJob(Long pipelineId, Long cronJobId, AiClubPipelineCronRequest request) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        requireWoodpeckerRepoReady(pipeline);
        AiClubPipelineCronJobEntity entity = requireCronJob(pipelineId, cronJobId);
        entity.setName(requireCronNameUnique(pipeline.getId(), request.name(), entity.getId()));
        entity.setBranch(normalizeBranch(request.branch()));
        entity.setCronExpression(normalizeCronExpression(request.cronExpression()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        applyRemoteCron(pipeline, entity);
        return toCronSummary(cronJobRepository.save(entity));
    }

    /**
     * 删除本地 cron，同时清理远端对应配置。
     */
    @Transactional
    public void deleteCronJob(Long pipelineId, Long cronJobId) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        requireWoodpeckerRepoReady(pipeline);
        AiClubPipelineCronJobEntity entity = requireCronJob(pipelineId, cronJobId);
        if (entity.getWoodpeckerCronId() != null && entity.getWoodpeckerCronId() > 0L) {
            woodpeckerApiService.deleteCron(pipeline.getWoodpeckerRepoId(), entity.getWoodpeckerCronId());
        }
        cronJobRepository.delete(entity);
    }

    /**
     * 返回公开触发 webhook 的当前配置。
     */
    public AiClubPipelineTriggerWebhookSummary getTriggerWebhook(Long pipelineId) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        return toTriggerWebhookSummary(pipeline, loadOrCreateTriggerWebhook(pipeline, false));
    }

    /**
     * 更新公开触发 webhook 配置，必要时重新生成 token。
     */
    @Transactional
    public AiClubPipelineTriggerWebhookSummary updateTriggerWebhook(Long pipelineId, AiClubPipelineTriggerWebhookRequest request) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        AiClubPipelineTriggerWebhookEntity entity = loadOrCreateTriggerWebhook(pipeline, true);
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        if (!hasText(entity.getTokenCiphertext()) || Boolean.TRUE.equals(request.regenerateToken())) {
            entity.setTokenCiphertext(tokenCipherService.encrypt(generateWebhookToken()));
        }
        return toTriggerWebhookSummary(pipeline, triggerWebhookRepository.save(entity));
    }

    /**
     * 返回外部回调 webhook 的当前配置。
     */
    public AiClubPipelineCallbackWebhookSummary getCallbackWebhook(Long pipelineId) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        return toCallbackWebhookSummary(loadOrCreateCallbackWebhook(pipeline, false));
    }

    /**
     * 更新外部回调 webhook 配置。
     */
    @Transactional
    public AiClubPipelineCallbackWebhookSummary updateCallbackWebhook(Long pipelineId, AiClubPipelineCallbackWebhookRequest request) {
        AiClubPipelineEntity pipeline = requireVisiblePipeline(pipelineId);
        AiClubPipelineCallbackWebhookEntity entity = loadOrCreateCallbackWebhook(pipeline, true);
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        if (hasText(request.callbackUrl())) {
            entity.setCallbackUrlCiphertext(tokenCipherService.encrypt(normalizeCallbackUrl(request.callbackUrl())));
        } else if (Boolean.TRUE.equals(request.enabled()) && !hasText(entity.getCallbackUrlCiphertext())) {
            throw new IllegalArgumentException("启用回调 Webhook 时必须提供回调地址");
        }
        entity.setSubscribedStatusesJson(writeSubscribedStatuses(normalizeSubscribedStatuses(request.subscribedStatuses())));
        return toCallbackWebhookSummary(callbackWebhookRepository.save(entity));
    }

    /**
     * 校验匿名公开触发的 token 是否有效，并返回对应流水线。
     */
    public AiClubPipelineEntity validateTriggerWebhookAccess(Long pipelineId, String token) {
        AiClubPipelineEntity pipeline = requirePipeline(pipelineId);
        AiClubPipelineTriggerWebhookEntity entity = triggerWebhookRepository.findByPipeline_Id(pipelineId)
                .orElseThrow(() -> new IllegalArgumentException("当前流水线未配置公开触发 Webhook"));
        if (!Boolean.TRUE.equals(entity.getEnabled())) {
            throw new IllegalArgumentException("当前流水线的公开触发 Webhook 未启用");
        }
        String decryptedToken = tokenCipherService.decrypt(entity.getTokenCiphertext());
        if (!Objects.equals(trimToNull(token), trimToNull(decryptedToken))) {
            throw new IllegalArgumentException("Webhook token 不正确");
        }
        if (!Boolean.TRUE.equals(pipeline.getEnabled())) {
            throw new IllegalArgumentException("当前 AI Club Pipeline 未启用");
        }
        return pipeline;
    }

    /**
     * 在平台触发成功后立即登记本地运行快照，便于后续轮询同步保留来源信息。
     */
    @Transactional
    public void recordTriggeredRun(AiClubPipelineEntity pipeline,
                                   WoodpeckerApiService.WoodpeckerPipeline run,
                                   String triggerSource) {
        if (pipeline == null || run == null || run.number() == null) {
            return;
        }
        upsertRunSnapshot(pipeline, run, triggerSource);
    }

    /**
     * 轮询同步最近运行，并在状态变化时生成待投递的外部回调记录。
     */
    @Transactional
    public void syncRecentRuns() {
        for (AiClubPipelineEntity pipeline : aiClubPipelineRepository.findByEnabledTrueAndWoodpeckerRepoIdIsNotNullOrderByIdAsc()) {
            syncRecentRunsForPipeline(pipeline);
        }
    }

    /**
     * 扫描并派发待发送的外部回调。
     */
    @Transactional
    public void dispatchPendingCallbackDeliveries() {
        List<AiClubPipelineCallbackDeliveryEntity> deliveries =
                callbackDeliveryRepository.findTop50ByDeliveryStatusInAndNextAttemptAtLessThanEqualOrderByIdAsc(
                        List.of(AiClubPipelineCallbackDeliveryEntity.STATUS_PENDING),
                        LocalDateTime.now()
                );
        for (AiClubPipelineCallbackDeliveryEntity delivery : deliveries) {
            deliverCallback(delivery);
        }
    }

    /**
     * 触发前校验目标分支存在配置文件，避免对外公开地址被误用成“裸触发器”。
     */
    public void ensurePipelineConfigPresent(AiClubPipelineEntity pipeline, String branch) {
        ProjectGitlabBindingEntity binding = pipeline.getGitlabBinding();
        String token = tokenCipherService.decrypt(binding.getTokenCiphertext());
        String projectRef = resolveProjectRef(binding);
        String configPath = defaultString(trimToNull(pipeline.getConfigPath()), ".woodpecker.yml");
        boolean exists = gitlabApiService.repositoryFileExists(
                binding.getApiBaseUrl(),
                token,
                projectRef,
                branch,
                configPath
        );
        if (!exists) {
            throw new IllegalArgumentException("目标分支 " + branch + " 尚未配置流水线文件 " + configPath + "，请先补全配置后再触发");
        }
    }

    private void syncRecentRunsForPipeline(AiClubPipelineEntity pipeline) {
        List<WoodpeckerApiService.WoodpeckerPipeline> runs =
                woodpeckerApiService.listPipelines(pipeline.getWoodpeckerRepoId(), automationProperties.getRunSyncFetchLimit());
        WoodpeckerApiService.WoodpeckerPipeline latestRun = null;
        for (WoodpeckerApiService.WoodpeckerPipeline run : runs) {
            if (run == null || run.number() == null) {
                continue;
            }
            if (latestRun == null || run.number() > latestRun.number()) {
                latestRun = run;
            }
            upsertRunSnapshot(pipeline, run, null);
        }
        if (latestRun != null) {
            pipeline.setLastRunStatus(normalizeRunStatus(latestRun.status()));
            pipeline.setLastRunMessage(limitMessage(latestRun.message()));
            pipeline.setLastRunNumber(latestRun.number());
            pipeline.setLastRunUrl(trimToNull(woodpeckerPipelineProvider.resolveRunUrl(pipeline, latestRun)));
            pipeline.setLastTriggeredAt(firstNonNull(latestRun.createdAt(), latestRun.startedAt(), latestRun.finishedAt(), pipeline.getLastTriggeredAt()));
            aiClubPipelineRepository.save(pipeline);
        }
    }

    /**
     * 同步单次运行快照时，优先保留平台已知的触发来源；如果是 cron 事件则直接回写为 cron。
     */
    private AiClubPipelineRunSnapshotEntity upsertRunSnapshot(AiClubPipelineEntity pipeline,
                                                              WoodpeckerApiService.WoodpeckerPipeline run,
                                                              String preferredTriggerSource) {
        AiClubPipelineRunSnapshotEntity entity = runSnapshotRepository.findByPipeline_IdAndRunNumber(pipeline.getId(), run.number())
                .orElseGet(AiClubPipelineRunSnapshotEntity::new);
        String normalizedStatus = normalizeRunStatus(run.status());
        String triggerSource = resolveTriggerSource(entity.getTriggerSource(), run.event(), preferredTriggerSource);
        String previousStatus = normalizeRunStatus(entity.getStatus());
        entity.setPipeline(pipeline);
        entity.setRunNumber(run.number());
        entity.setStatus(normalizedStatus);
        entity.setBranch(trimToNull(run.branch()));
        entity.setEvent(trimToNull(run.event()));
        entity.setMessage(limitMessage(run.message()));
        entity.setCommitSha(trimToNull(run.commit()));
        entity.setRunUrl(trimToNull(woodpeckerPipelineProvider.resolveRunUrl(pipeline, run)));
        entity.setTriggerSource(triggerSource);
        entity.setCreatedAtRemote(run.createdAt());
        entity.setStartedAtRemote(run.startedAt());
        entity.setFinishedAtRemote(run.finishedAt());
        entity.setLastSyncedAt(LocalDateTime.now());
        AiClubPipelineRunSnapshotEntity saved = runSnapshotRepository.save(entity);
        if (!Objects.equals(previousStatus, normalizedStatus)) {
            scheduleCallbackIfNecessary(saved, normalizedStatus);
        }
        return saved;
    }

    /**
     * 仅当用户已经订阅当前状态时，才生成外部回调记录。
     */
    private void scheduleCallbackIfNecessary(AiClubPipelineRunSnapshotEntity snapshot, String status) {
        if (!hasText(status)) {
            return;
        }
        AiClubPipelineCallbackWebhookEntity webhook = callbackWebhookRepository.findByPipeline_Id(snapshot.getPipeline().getId())
                .orElse(null);
        if (webhook == null || !Boolean.TRUE.equals(webhook.getEnabled()) || !hasText(webhook.getCallbackUrlCiphertext())) {
            return;
        }
        List<String> subscribedStatuses = readSubscribedStatuses(webhook);
        if (!subscribedStatuses.contains(status)) {
            return;
        }
        if (callbackDeliveryRepository.findByRunSnapshot_IdAndCallbackStatus(snapshot.getId(), status).isPresent()) {
            return;
        }
        AiClubPipelineCallbackDeliveryEntity delivery = new AiClubPipelineCallbackDeliveryEntity();
        delivery.setCallbackWebhook(webhook);
        delivery.setRunSnapshot(snapshot);
        delivery.setCallbackStatus(status);
        delivery.setDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_PENDING);
        delivery.setCallbackUrlCiphertext(webhook.getCallbackUrlCiphertext());
        delivery.setPayloadJson(buildCallbackPayload(snapshot));
        delivery.setAttemptCount(0);
        delivery.setNextAttemptAt(LocalDateTime.now());
        callbackDeliveryRepository.save(delivery);
    }

    /**
     * 回调发送采用“成功即完成、失败有限重试”的策略，避免影响主触发链路。
     */
    private void deliverCallback(AiClubPipelineCallbackDeliveryEntity delivery) {
        LocalDateTime now = LocalDateTime.now();
        AiClubPipelineCallbackWebhookEntity webhook = delivery.getCallbackWebhook();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(tokenCipherService.decrypt(delivery.getCallbackUrlCiphertext())))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(delivery.getPayloadJson() == null ? "" : delivery.getPayloadJson(), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            delivery.setAttemptCount(defaultInteger(delivery.getAttemptCount(), 0) + 1);
            delivery.setLastAttemptAt(now);
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                delivery.setDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_SUCCESS);
                delivery.setDeliveredAt(now);
                delivery.setLastErrorMessage(null);
                webhook.setLastDeliveryAt(now);
                webhook.setLastDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_SUCCESS);
                callbackWebhookRepository.save(webhook);
                callbackDeliveryRepository.save(delivery);
                return;
            }
            handleDeliveryFailure(delivery, webhook, now, "Webhook 回调失败，HTTP 状态码: " + response.statusCode());
        } catch (Exception exception) {
            handleDeliveryFailure(delivery, webhook, now, resolveDeliveryError(exception));
        }
    }

    private void handleDeliveryFailure(AiClubPipelineCallbackDeliveryEntity delivery,
                                       AiClubPipelineCallbackWebhookEntity webhook,
                                       LocalDateTime now,
                                       String errorMessage) {
        int nextAttemptCount = defaultInteger(delivery.getAttemptCount(), 0) + 1;
        delivery.setAttemptCount(nextAttemptCount);
        delivery.setLastAttemptAt(now);
        delivery.setLastErrorMessage(limitMessage(errorMessage));
        if (nextAttemptCount >= automationProperties.getCallbackDeliveryMaxAttempts()) {
            delivery.setDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_FAILED);
            webhook.setLastDeliveryAt(now);
            webhook.setLastDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_FAILED);
        } else {
            delivery.setDeliveryStatus(AiClubPipelineCallbackDeliveryEntity.STATUS_PENDING);
            delivery.setNextAttemptAt(now.plusMinutes(Math.min(nextAttemptCount, 10)));
            webhook.setLastDeliveryAt(now);
            webhook.setLastDeliveryStatus("RETRYING");
        }
        callbackWebhookRepository.save(webhook);
        callbackDeliveryRepository.save(delivery);
    }

    private String buildCallbackPayload(AiClubPipelineRunSnapshotEntity snapshot) {
        try {
            AiClubPipelineEntity pipeline = snapshot.getPipeline();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("pipelineId", pipeline.getId());
            payload.put("pipelineName", pipeline.getName());
            payload.put("projectId", pipeline.getProject().getId());
            payload.put("projectName", pipeline.getProject().getName());
            payload.put("providerCode", pipeline.getProviderCode());
            payload.put("runNumber", snapshot.getRunNumber());
            payload.put("status", defaultString(snapshot.getStatus()));
            payload.put("branch", defaultString(snapshot.getBranch()));
            payload.put("event", defaultString(snapshot.getEvent()));
            payload.put("message", defaultString(snapshot.getMessage()));
            payload.put("runUrl", defaultString(snapshot.getRunUrl()));
            payload.put("triggerSource", defaultString(snapshot.getTriggerSource(), defaultString(snapshot.getEvent())));
            payload.put("triggeredAt", formatTime(firstNonNull(snapshot.getCreatedAtRemote(), snapshot.getStartedAtRemote())));
            payload.put("startedAt", formatTime(snapshot.getStartedAtRemote()));
            payload.put("finishedAt", formatTime(snapshot.getFinishedAtRemote()));
            return objectMapper.writeValueAsString(payload);
        } catch (IOException exception) {
            throw new IllegalStateException("构造流水线回调载荷失败", exception);
        }
    }

    private void applyRemoteCron(AiClubPipelineEntity pipeline, AiClubPipelineCronJobEntity entity) {
        WoodpeckerApiService.WoodpeckerCron remoteCron = entity.getWoodpeckerCronId() == null
                ? woodpeckerApiService.createCron(
                pipeline.getWoodpeckerRepoId(),
                entity.getName(),
                entity.getCronExpression(),
                entity.getBranch()
        )
                : woodpeckerApiService.updateCron(
                pipeline.getWoodpeckerRepoId(),
                entity.getWoodpeckerCronId(),
                entity.getName(),
                entity.getCronExpression(),
                entity.getBranch()
        );
        entity.setWoodpeckerCronId(remoteCron.id());
        entity.setEnabled(remoteCron.enabled());
        entity.setNextRunAt(remoteCron.nextRunAt());
        entity.setLastSyncedAt(LocalDateTime.now());
    }

    private AiClubPipelineEntity requireVisiblePipeline(Long pipelineId) {
        AiClubPipelineEntity pipeline = requirePipeline(pipelineId);
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireProjectVisible(pipeline.getProject(), scope);
        }
        return pipeline;
    }

    private AiClubPipelineEntity requirePipeline(Long pipelineId) {
        return aiClubPipelineRepository.findById(pipelineId)
                .orElseThrow(() -> new NoSuchElementException("AI Club Pipeline 不存在: " + pipelineId));
    }

    private AiClubPipelineCronJobEntity requireCronJob(Long pipelineId, Long cronJobId) {
        AiClubPipelineCronJobEntity entity = cronJobRepository.findById(cronJobId)
                .orElseThrow(() -> new NoSuchElementException("Cron 配置不存在: " + cronJobId));
        if (!Objects.equals(entity.getPipeline().getId(), pipelineId)) {
            throw new IllegalArgumentException("当前 Cron 不属于指定流水线");
        }
        return entity;
    }

    private void requireWoodpeckerRepoReady(AiClubPipelineEntity pipeline) {
        if (pipeline.getWoodpeckerRepoId() == null || pipeline.getWoodpeckerRepoId() <= 0L) {
            throw new IllegalArgumentException("流水线尚未同步 Woodpecker 仓库");
        }
    }

    private String requireCronNameUnique(Long pipelineId, String name, Long currentId) {
        String normalizedName = trimToNull(name);
        if (normalizedName == null) {
            throw new IllegalArgumentException("Cron 名称不能为空");
        }
        boolean duplicated = currentId == null
                ? cronJobRepository.existsByPipeline_IdAndName(pipelineId, normalizedName)
                : cronJobRepository.existsByPipeline_IdAndNameAndIdNot(pipelineId, normalizedName, currentId);
        if (duplicated) {
            throw new IllegalArgumentException("同一条流水线下已存在同名 Cron");
        }
        return normalizedName;
    }

    private String normalizeCronExpression(String cronExpression) {
        String normalized = trimToNull(cronExpression);
        if (normalized == null) {
            throw new IllegalArgumentException("Cron 表达式不能为空");
        }
        try {
            CronExpression.parse(normalized);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Cron 表达式格式不正确，Woodpecker 需要使用带秒的 Cron 语法");
        }
        return normalized;
    }

    private String normalizeBranch(String branch) {
        String normalized = trimToNull(branch);
        return normalized == null ? null : normalized;
    }

    private String normalizeCallbackUrl(String callbackUrl) {
        String normalized = trimToNull(callbackUrl);
        if (normalized == null) {
            throw new IllegalArgumentException("回调地址不能为空");
        }
        try {
            URI uri = URI.create(normalized);
            String scheme = defaultString(uri.getScheme()).toLowerCase();
            if (!"http".equals(scheme) && !"https".equals(scheme)) {
                throw new IllegalArgumentException("回调地址仅支持 http 或 https");
            }
            return normalized;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("回调地址格式不正确");
        }
    }

    private List<String> normalizeSubscribedStatuses(List<String> statuses) {
        Set<String> result = new LinkedHashSet<>();
        if (statuses != null) {
            for (String status : statuses) {
                String normalized = normalizeRunStatus(status);
                if (hasText(normalized)) {
                    result.add(normalized);
                }
            }
        }
        if (result.isEmpty()) {
            result.addAll(List.of("SUCCESS", "FAILED", "CANCELED"));
        }
        for (String status : result) {
            if (!SUPPORTED_CALLBACK_STATUSES.contains(status)) {
                throw new IllegalArgumentException("回调状态仅支持: " + String.join(", ", SUPPORTED_CALLBACK_STATUSES));
            }
        }
        return List.copyOf(result);
    }

    private AiClubPipelineTriggerWebhookEntity loadOrCreateTriggerWebhook(AiClubPipelineEntity pipeline, boolean createIfMissing) {
        AiClubPipelineTriggerWebhookEntity entity = triggerWebhookRepository.findByPipeline_Id(pipeline.getId()).orElse(null);
        if (entity != null || !createIfMissing) {
            return entity;
        }
        entity = new AiClubPipelineTriggerWebhookEntity();
        entity.setPipeline(pipeline);
        entity.setTokenCiphertext(tokenCipherService.encrypt(generateWebhookToken()));
        return entity;
    }

    private AiClubPipelineCallbackWebhookEntity loadOrCreateCallbackWebhook(AiClubPipelineEntity pipeline, boolean createIfMissing) {
        AiClubPipelineCallbackWebhookEntity entity = callbackWebhookRepository.findByPipeline_Id(pipeline.getId()).orElse(null);
        if (entity != null || !createIfMissing) {
            return entity;
        }
        entity = new AiClubPipelineCallbackWebhookEntity();
        entity.setPipeline(pipeline);
        entity.setSubscribedStatusesJson(writeSubscribedStatuses(List.of("SUCCESS", "FAILED", "CANCELED")));
        return entity;
    }

    private AiClubPipelineCronSummary toCronSummary(AiClubPipelineCronJobEntity entity) {
        return new AiClubPipelineCronSummary(
                entity.getId(),
                entity.getWoodpeckerCronId(),
                entity.getName(),
                entity.getBranch(),
                entity.getCronExpression(),
                defaultBoolean(entity.getEnabled(), true),
                formatTime(entity.getNextRunAt()),
                formatTime(entity.getLastSyncedAt())
        );
    }

    private AiClubPipelineTriggerWebhookSummary toTriggerWebhookSummary(AiClubPipelineEntity pipeline, AiClubPipelineTriggerWebhookEntity entity) {
        String triggerUrl = null;
        String maskedToken = null;
        String updatedAt = null;
        if (entity != null) {
            String token = tokenCipherService.decrypt(entity.getTokenCiphertext());
            triggerUrl = hasText(token) ? buildTriggerWebhookUrl(pipeline.getId(), token) : null;
            maskedToken = maskToken(token);
            updatedAt = formatTime(entity.getUpdatedAt());
        }
        return new AiClubPipelineTriggerWebhookSummary(
                entity != null && Boolean.TRUE.equals(entity.getEnabled()),
                triggerUrl,
                maskedToken,
                updatedAt
        );
    }

    private AiClubPipelineCallbackWebhookSummary toCallbackWebhookSummary(AiClubPipelineCallbackWebhookEntity entity) {
        return new AiClubPipelineCallbackWebhookSummary(
                entity != null && Boolean.TRUE.equals(entity.getEnabled()),
                entity == null ? null : maskUrl(readCallbackUrl(entity)),
                entity == null ? List.of() : readSubscribedStatuses(entity),
                entity == null ? null : formatTime(entity.getUpdatedAt()),
                entity == null ? null : formatTime(entity.getLastDeliveryAt()),
                entity == null ? null : trimToNull(entity.getLastDeliveryStatus())
        );
    }

    private List<String> readSubscribedStatuses(AiClubPipelineCallbackWebhookEntity entity) {
        if (entity == null || !hasText(entity.getSubscribedStatusesJson())) {
            return List.of("SUCCESS", "FAILED", "CANCELED");
        }
        try {
            List<String> values = objectMapper.readValue(entity.getSubscribedStatusesJson(), STRING_LIST_TYPE);
            return normalizeSubscribedStatuses(values);
        } catch (IOException exception) {
            return List.of("SUCCESS", "FAILED", "CANCELED");
        }
    }

    private String writeSubscribedStatuses(List<String> statuses) {
        try {
            return objectMapper.writeValueAsString(statuses == null ? List.of() : statuses);
        } catch (IOException exception) {
            throw new IllegalStateException("序列化回调状态失败", exception);
        }
    }

    private String readCallbackUrl(AiClubPipelineCallbackWebhookEntity entity) {
        if (entity == null || !hasText(entity.getCallbackUrlCiphertext())) {
            return null;
        }
        return tokenCipherService.decrypt(entity.getCallbackUrlCiphertext());
    }

    private String buildTriggerWebhookUrl(Long pipelineId, String token) {
        String baseUrl = trimToNull(automationProperties.getPublicBaseUrl());
        if (baseUrl == null) {
            baseUrl = resolveCurrentRequestBaseUrl();
        }
        if (baseUrl == null) {
            return null;
        }
        return baseUrl + "/api/cicd/public/pipelines/" + pipelineId + "/trigger/" + token;
    }

    private String resolveCurrentRequestBaseUrl() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (!(attributes instanceof ServletRequestAttributes servletRequestAttributes)) {
            return null;
        }
        HttpServletRequest request = servletRequestAttributes.getRequest();
        StringBuilder builder = new StringBuilder();
        builder.append(request.getScheme()).append("://").append(request.getServerName());
        if (request.getServerPort() > 0
                && !("http".equalsIgnoreCase(request.getScheme()) && request.getServerPort() == 80)
                && !("https".equalsIgnoreCase(request.getScheme()) && request.getServerPort() == 443)) {
            builder.append(':').append(request.getServerPort());
        }
        return builder.toString();
    }

    private String resolveProjectRef(ProjectGitlabBindingEntity binding) {
        String projectRef = firstText(binding.getGitlabProjectRef(), binding.getGitlabProjectPath(), binding.getGitlabProjectId());
        if (projectRef == null) {
            throw new IllegalArgumentException("GitLab 绑定缺少项目标识");
        }
        return projectRef;
    }

    private String resolveTriggerSource(String existingTriggerSource, String event, String preferredTriggerSource) {
        if ("cron".equalsIgnoreCase(defaultString(event))) {
            return "Cron 触发";
        }
        String normalizedPreferred = trimToNull(preferredTriggerSource);
        if (normalizedPreferred != null) {
            return normalizedPreferred;
        }
        String normalizedExisting = trimToNull(existingTriggerSource);
        if (normalizedExisting != null) {
            return normalizedExisting;
        }
        String normalizedEvent = trimToNull(event);
        if (normalizedEvent == null) {
            return "AI Club";
        }
        return normalizedEvent.toUpperCase();
    }

    private String resolveDeliveryError(Exception exception) {
        if (exception == null || !hasText(exception.getMessage())) {
            return "Webhook 回调失败";
        }
        return exception.getMessage().trim();
    }

    private String generateWebhookToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private String normalizeRunStatus(String status) {
        String normalized = trimToNull(status);
        return normalized == null ? null : normalized.toUpperCase();
    }

    private String maskToken(String token) {
        String normalized = trimToNull(token);
        if (normalized == null) {
            return null;
        }
        if (normalized.length() <= 8) {
            return normalized.substring(0, Math.min(4, normalized.length())) + "****";
        }
        return normalized.substring(0, 4) + "****" + normalized.substring(normalized.length() - 4);
    }

    private String maskUrl(String url) {
        String normalized = trimToNull(url);
        if (normalized == null) {
            return null;
        }
        try {
            URI uri = URI.create(normalized);
            String host = defaultString(uri.getHost());
            String scheme = defaultString(uri.getScheme());
            String path = defaultString(uri.getPath());
            if (!hasText(host)) {
                return "****";
            }
            return scheme + "://" + host + (hasText(path) ? path : "");
        } catch (Exception exception) {
            return "****";
        }
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String defaultString(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean defaultBoolean(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private Integer defaultInteger(Integer value, int defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String limitMessage(String message) {
        if (!hasText(message)) {
            return "";
        }
        String value = message.trim();
        return value.length() > 500 ? value.substring(0, 500) : value;
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    @SafeVarargs
    private <T> T firstNonNull(T... values) {
        if (values == null) {
            return null;
        }
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }
}
