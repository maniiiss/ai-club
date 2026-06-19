package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeWebhookEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Executor;

/**
 * GitLab 自动合并外发 Webhook 异步投递器。
 *
 * <p>每条自动合并日志落库后调用一次 {@link #dispatchAsync(GitlabAutoMergeLogEntity)}，
 * 在独立线程池里逐条对启用的 webhook 投递；按用户选择，失败只记录最近一次状态，
 * 不进重试队列，也不阻塞主流程。</p>
 */
@Component
public class GitlabAutoMergeWebhookDispatcher {

    private static final Logger log = LoggerFactory.getLogger(GitlabAutoMergeWebhookDispatcher.class);
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final int LAST_DELIVERY_MESSAGE_LIMIT = 480;

    /** 投递事件白名单，与日志 result 一一对应（BRANCH_BEHIND 是 SKIPPED 的语义子集，单独暴露便于订阅）。 */
    public static final Set<String> SUPPORTED_EVENTS = Set.of(
            "MERGED",
            "AI_REJECTED",
            "FAILED",
            "SKIPPED",
            "BRANCH_BEHIND",
            "EMPTY"
    );
    private static final String BRANCH_BEHIND_REASON_PREFIX = "源分支落后于目标分支";

    private final GitlabAutoMergeWebhookRepository webhookRepository;
    private final GitlabAutoMergeLogRepository autoMergeLogRepository;
    private final TokenCipherService tokenCipherService;
    private final ObjectMapper objectMapper;
    private final Executor executor;
    private final TransactionTemplate requiresNewTransactionTemplate;
    private final HttpClient httpClient;

    public GitlabAutoMergeWebhookDispatcher(GitlabAutoMergeWebhookRepository webhookRepository,
                                            GitlabAutoMergeLogRepository autoMergeLogRepository,
                                            TokenCipherService tokenCipherService,
                                            ObjectMapper objectMapper,
                                            @Qualifier("executionTaskExecutor") Executor executor,
                                            PlatformTransactionManager transactionManager) {
        this.webhookRepository = webhookRepository;
        this.autoMergeLogRepository = autoMergeLogRepository;
        this.tokenCipherService = tokenCipherService;
        this.objectMapper = objectMapper;
        this.executor = executor;
        this.requiresNewTransactionTemplate = new TransactionTemplate(transactionManager);
        this.requiresNewTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
    }

    /**
     * 由 saveAutoMergeLog 末尾调用：异步将日志按订阅事件分发给启用的 webhook。
     * 任何异常都吞掉，绝不影响主流程。
     */
    public void dispatchAsync(GitlabAutoMergeLogEntity logEntity) {
        if (logEntity == null) {
            return;
        }
        GitlabAutoMergeConfigEntity config = logEntity.getConfig();
        if (config == null || config.getId() == null) {
            return;
        }
        String event = resolveEvent(logEntity);
        Long configId = config.getId();
        String configName = config.getName();
        Long mergeRequestIid = logEntity.getMergeRequestIid();
        Map<String, Object> payload = buildPayloadModel(logEntity, event);
        if (shouldSuppressWebhook(logEntity, event)) {
            return;
        }
        try {
            executor.execute(() -> dispatchInternal(configId, configName, mergeRequestIid, event, payload));
        } catch (Exception ex) {
            log.warn("提交 GitLab 自动合并 webhook 投递任务失败 configId={} mr={} : {}", configId, mergeRequestIid, ex.getMessage());
        }
    }

    /**
     * 从 controller 触发的"测试投递"：用一份固定的演示载荷打到指定 webhook，便于运维联调。
     */
    public DeliveryOutcome dispatchTest(GitlabAutoMergeWebhookEntity webhook) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", "TEST");
        payload.put("configId", webhook.getConfig() == null ? null : webhook.getConfig().getId());
        payload.put("configName", webhook.getConfig() == null ? null : webhook.getConfig().getName());
        payload.put("mergeRequestIid", 0);
        payload.put("mergeRequestTitle", "示例 Merge Request");
        payload.put("mergeRequestAuthor", "demo-user");
        payload.put("result", "MERGED");
        payload.put("reason", "GitLab 自动合并 Webhook 测试投递");
        payload.put("webUrl", "");
        payload.put("executedAt", TIME_FORMATTER.format(LocalDateTime.now()));
        payload.put("triggerType", "TEST");
        payload.put("projectRef", webhook.getConfig() == null ? null : webhook.getConfig().getGitlabProjectRef());
        return doDeliver(webhook, "TEST", payload);
    }

    private void dispatchInternal(Long configId, String configName, Long mergeRequestIid, String event, Map<String, Object> payload) {
        List<GitlabAutoMergeWebhookEntity> targets;
        try {
            targets = webhookRepository.findByConfig_IdAndEnabledTrueOrderByIdAsc(configId);
        } catch (Exception ex) {
            log.warn("加载自动合并 webhook 列表失败 configId={} : {}", configId, ex.getMessage());
            return;
        }
        if (targets == null || targets.isEmpty()) {
            return;
        }
        for (GitlabAutoMergeWebhookEntity webhook : targets) {
            try {
                List<String> subscribed = readEventList(webhook.getSubscribedEventsJson());
                if (!subscribed.contains(event)) {
                    continue;
                }
                doDeliver(webhook, event, payload);
            } catch (Exception ex) {
                log.warn("投递自动合并 webhook 失败 configId={} mr={} webhookId={} : {}",
                        configId, mergeRequestIid, webhook.getId(), ex.getMessage());
            }
        }
    }

    /**
     * webhook 去重不影响日志留存；只有“上一条同作用域日志的事件+原因摘要完全一致”时才抑制外发。
     */
    private boolean shouldSuppressWebhook(GitlabAutoMergeLogEntity logEntity, String event) {
        GitlabAutoMergeConfigEntity config = logEntity.getConfig();
        Long configId = config == null ? null : config.getId();
        Long currentLogId = logEntity.getId();
        if (configId == null || currentLogId == null) {
            return false;
        }
        Optional<GitlabAutoMergeLogEntity> previousLog;
        if (logEntity.getMergeRequestIid() == null) {
            previousLog = autoMergeLogRepository.findTopByConfig_IdAndMergeRequestIidIsNullAndIdLessThanOrderByIdDesc(configId, currentLogId);
        } else {
            previousLog = autoMergeLogRepository.findTopByConfig_IdAndMergeRequestIidAndIdLessThanOrderByIdDesc(configId, logEntity.getMergeRequestIid(), currentLogId);
        }
        if (previousLog.isEmpty()) {
            return false;
        }
        String currentStateKey = buildStateKey(event, logEntity.getReason());
        String previousStateKey = buildStateKey(resolveEvent(previousLog.get()), previousLog.get().getReason());
        return currentStateKey.equals(previousStateKey);
    }

    /** 实际发送 HTTP；调用方负责保证不抛出。 */
    private DeliveryOutcome doDeliver(GitlabAutoMergeWebhookEntity webhook, String event, Map<String, Object> payloadModel) {
        LocalDateTime now = LocalDateTime.now();
        String status;
        String message;
        try {
            String url = tokenCipherService.decrypt(webhook.getTargetUrlCiphertext());
            String body = renderBody(webhook.getMessageTemplate(), payloadModel);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(REQUEST_TIMEOUT)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("X-AiClub-Event", "gitlab-auto-merge:" + event)
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int code = response.statusCode();
            if (code >= 200 && code < 300) {
                status = "SUCCESS";
                message = "HTTP " + code;
            } else {
                status = "FAILED:" + code;
                String responseBody = response.body() == null ? "" : response.body();
                message = "HTTP " + code + " " + responseBody;
            }
        } catch (Exception ex) {
            status = "FAILED:EX";
            message = ex.getClass().getSimpleName() + ": " + (ex.getMessage() == null ? "" : ex.getMessage());
        }
        message = limitMessage(message);
        persistDeliveryStatus(webhook.getId(), now, status, message);
        return new DeliveryOutcome(status, message);
    }

    /** 在新事务里更新 last_delivery_*，避免污染调用方事务，也避免被回滚抹掉。 */
    private void persistDeliveryStatus(Long webhookId, LocalDateTime executedAt, String status, String message) {
        try {
            requiresNewTransactionTemplate.executeWithoutResult(tx -> webhookRepository.findById(webhookId).ifPresent(target -> {
                target.setLastDeliveryAt(executedAt);
                target.setLastDeliveryStatus(status);
                target.setLastDeliveryMessage(message);
                webhookRepository.save(target);
            }));
        } catch (Exception ex) {
            log.warn("写入自动合并 webhook 投递状态失败 webhookId={} : {}", webhookId, ex.getMessage());
        }
    }

    private Map<String, Object> buildPayloadModel(GitlabAutoMergeLogEntity logEntity, String event) {
        GitlabAutoMergeConfigEntity config = logEntity.getConfig();
        ProjectGitlabBindingEntity binding = config == null ? null : config.getBinding();
        String projectRef = config == null ? null : config.getGitlabProjectRef();
        if ((projectRef == null || projectRef.isBlank()) && binding != null) {
            projectRef = binding.getGitlabProjectRef();
        }
        if (projectRef == null || projectRef.isBlank()) {
            projectRef = logEntity.getGitlabProjectRefSnapshot();
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("event", event);
        payload.put("configId", config == null ? null : config.getId());
        payload.put("configName", logEntity.getConfigName());
        payload.put("projectRef", projectRef);
        payload.put("mergeRequestIid", logEntity.getMergeRequestIid());
        payload.put("mergeRequestTitle", logEntity.getMergeRequestTitle());
        String author = logEntity.getMergeRequestAuthorName() != null && !logEntity.getMergeRequestAuthorName().isBlank()
                ? logEntity.getMergeRequestAuthorName()
                : logEntity.getMergeRequestAuthorUsername();
        payload.put("mergeRequestAuthor", author);
        payload.put("result", logEntity.getResult());
        payload.put("reason", logEntity.getReason());
        payload.put("webUrl", logEntity.getWebUrl());
        payload.put("executedAt", logEntity.getExecutedAt() == null ? null : TIME_FORMATTER.format(logEntity.getExecutedAt()));
        payload.put("triggerType", logEntity.getTriggerType());
        return payload;
    }

    /**
     * 模板留空 → 直接发通用 JSON；模板非空 → 渲染后包成 {"msgtype":"text","text":{"content":...}}，
     * 这是钉钉/飞书/企业微信 text 机器人通用结构，运维可在 URL 上拼签名参数。
     */
    private String renderBody(String template, Map<String, Object> payloadModel) throws Exception {
        if (template == null || template.isBlank()) {
            return objectMapper.writeValueAsString(payloadModel);
        }
        String rendered = renderTemplate(template, payloadModel);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("msgtype", "text");
        Map<String, Object> textBlock = new LinkedHashMap<>();
        textBlock.put("content", rendered);
        envelope.put("text", textBlock);
        return objectMapper.writeValueAsString(envelope);
    }

    /**
     * 简单 {{key}} 占位符替换：null 渲染为空串，未知占位符保持原样以便用户排查。
     * 不引入复杂模板引擎，刻意保持轻量。
     */
    private String renderTemplate(String template, Map<String, Object> payloadModel) {
        StringBuilder out = new StringBuilder(template.length() + 32);
        int i = 0;
        while (i < template.length()) {
            int open = template.indexOf("{{", i);
            if (open < 0) {
                out.append(template, i, template.length());
                break;
            }
            out.append(template, i, open);
            int close = template.indexOf("}}", open + 2);
            if (close < 0) {
                out.append(template, open, template.length());
                break;
            }
            String key = template.substring(open + 2, close).trim();
            Object value = payloadModel.get(key);
            if (value == null) {
                if (!payloadModel.containsKey(key)) {
                    // 未知占位符，原样保留
                    out.append(template, open, close + 2);
                }
            } else {
                out.append(value);
            }
            i = close + 2;
        }
        return out.toString();
    }

    private List<String> readEventList(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            List<String> list = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            return list == null ? Collections.emptyList() : list;
        } catch (Exception ex) {
            log.warn("解析自动合并 webhook 订阅事件失败: {}", ex.getMessage());
            return Collections.emptyList();
        }
    }

    private String resolveEvent(GitlabAutoMergeLogEntity logEntity) {
        String result = logEntity.getResult();
        if ("SKIPPED".equalsIgnoreCase(result)) {
            String reason = logEntity.getReason() == null ? "" : logEntity.getReason();
            if (reason.startsWith(BRANCH_BEHIND_REASON_PREFIX)) {
                return "BRANCH_BEHIND";
            }
        }
        return result == null ? "" : result.toUpperCase();
    }

    private String buildStateKey(String event, String reason) {
        return defaultString(event).trim().toUpperCase() + "|" + defaultString(reason).trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String limitMessage(String text) {
        if (text == null) {
            return null;
        }
        String compact = text.replaceAll("\\s+", " ").trim();
        if (compact.length() <= LAST_DELIVERY_MESSAGE_LIMIT) {
            return compact;
        }
        return compact.substring(0, LAST_DELIVERY_MESSAGE_LIMIT) + "...";
    }

    /** 测试入口的简单返回结构，便于 controller 包成 Summary 返回前端。 */
    public record DeliveryOutcome(String status, String message) {
    }
}
