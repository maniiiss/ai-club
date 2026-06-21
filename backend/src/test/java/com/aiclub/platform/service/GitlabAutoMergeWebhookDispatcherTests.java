package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabAutoMergeConfigEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeLogEntity;
import com.aiclub.platform.domain.model.GitlabAutoMergeWebhookEntity;
import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import com.aiclub.platform.repository.GitlabAutoMergeWebhookRepository;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 GitLab 自动合并 webhook 投递的状态去重逻辑，确保重复日志不会反复外发。
 */
@ExtendWith(MockitoExtension.class)
class GitlabAutoMergeWebhookDispatcherTests {

    @Mock
    private GitlabAutoMergeWebhookRepository webhookRepository;

    @Mock
    private GitlabAutoMergeLogRepository autoMergeLogRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private PlatformTransactionManager transactionManager;

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    /**
     * 同一 MR 连续出现相同的 AI_REJECTED 原因时，只允许第一次真正投递外部 webhook。
     */
    @Test
    void shouldSuppressWebhookWhenStateKeyUnchanged() {
        GitlabAutoMergeWebhookDispatcher dispatcher = buildDispatcher();
        GitlabAutoMergeLogEntity currentLog = buildLog(201L, 31L, "AI_REJECTED", "历史问题未修复");
        GitlabAutoMergeLogEntity previousLog = buildLog(200L, 31L, "AI_REJECTED", "历史问题未修复");

        when(autoMergeLogRepository.findTopByConfig_IdAndMergeRequestIidAndIdLessThanOrderByIdDesc(9L, 31L, 201L))
                .thenReturn(Optional.of(previousLog));

        dispatcher.dispatchAsync(currentLog);

        verify(tokenCipherService, never()).decrypt(any());
    }

    /**
     * 同一 MR 虽然还是 AI_REJECTED，但原因变化后属于新状态，应继续外发 webhook。
     */
    @Test
    void shouldDeliverWebhookWhenReasonChanges() throws Exception {
        AtomicInteger hitCounter = new AtomicInteger();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hook", exchange -> {
            hitCounter.incrementAndGet();
            byte[] body = "{\"ok\":true}".getBytes();
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();

        GitlabAutoMergeWebhookDispatcher dispatcher = buildDispatcher();
        GitlabAutoMergeLogEntity currentLog = buildLog(202L, 31L, "AI_REJECTED", "新增边界遗漏");
        GitlabAutoMergeLogEntity previousLog = buildLog(201L, 31L, "AI_REJECTED", "历史问题未修复");
        GitlabAutoMergeWebhookEntity webhook = buildWebhook("http://127.0.0.1:" + server.getAddress().getPort() + "/hook");

        when(webhookRepository.findByConfig_IdAndEnabledTrueOrderByIdAsc(9L)).thenReturn(List.of(webhook));
        when(autoMergeLogRepository.findTopByConfig_IdAndMergeRequestIidAndIdLessThanOrderByIdDesc(9L, 31L, 202L))
                .thenReturn(Optional.of(previousLog));
        when(tokenCipherService.decrypt(webhook.getTargetUrlCiphertext())).thenReturn("http://127.0.0.1:" + server.getAddress().getPort() + "/hook");
        when(webhookRepository.findById(51L)).thenReturn(Optional.of(webhook));
        when(webhookRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        dispatcher.dispatchAsync(currentLog);

        verify(tokenCipherService).decrypt(webhook.getTargetUrlCiphertext());
        org.assertj.core.api.Assertions.assertThat(hitCounter.get()).isEqualTo(1);
    }

    /**
     * EMPTY 这类没有 MR IID 的日志也要按配置级别去重，避免空执行反复刷群。
     */
    @Test
    void shouldSuppressEmptyWebhookWhenPreviousConfigLevelStateMatches() {
        GitlabAutoMergeWebhookDispatcher dispatcher = buildDispatcher();
        GitlabAutoMergeLogEntity currentLog = buildLog(301L, null, "EMPTY", "未匹配到可执行的开放 Merge Request");
        GitlabAutoMergeLogEntity previousLog = buildLog(300L, null, "EMPTY", "未匹配到可执行的开放 Merge Request");

        when(autoMergeLogRepository.findTopByConfig_IdAndMergeRequestIidIsNullAndIdLessThanOrderByIdDesc(9L, 301L))
                .thenReturn(Optional.of(previousLog));

        dispatcher.dispatchAsync(currentLog);

        verify(tokenCipherService, never()).decrypt(any());
    }

    private GitlabAutoMergeWebhookDispatcher buildDispatcher() {
        Executor inlineExecutor = Runnable::run;
        return new GitlabAutoMergeWebhookDispatcher(
                webhookRepository,
                autoMergeLogRepository,
                tokenCipherService,
                new com.fasterxml.jackson.databind.ObjectMapper(),
                inlineExecutor,
                transactionManager
        );
    }

    private GitlabAutoMergeLogEntity buildLog(Long id, Long mergeRequestIid, String result, String reason) {
        GitlabAutoMergeConfigEntity config = new GitlabAutoMergeConfigEntity();
        config.setId(9L);
        config.setName("演示自动合并");
        config.setGitlabProjectRef("group/demo-repo");

        GitlabAutoMergeLogEntity log = new GitlabAutoMergeLogEntity();
        log.setId(id);
        log.setConfig(config);
        log.setConfigName(config.getName());
        log.setTriggerType("SCHEDULED");
        log.setMergeRequestIid(mergeRequestIid);
        log.setMergeRequestTitle("登录优化");
        log.setMergeRequestAuthorUsername("alice");
        log.setResult(result);
        log.setReason(reason);
        log.setExecutedAt(LocalDateTime.of(2026, 6, 18, 23, 0));
        return log;
    }

    private GitlabAutoMergeWebhookEntity buildWebhook(String url) {
        GitlabAutoMergeConfigEntity config = new GitlabAutoMergeConfigEntity();
        config.setId(9L);
        config.setName("演示自动合并");
        config.setGitlabProjectRef("group/demo-repo");

        GitlabAutoMergeWebhookEntity webhook = new GitlabAutoMergeWebhookEntity();
        webhook.setId(51L);
        webhook.setConfig(config);
        webhook.setName("群通知");
        webhook.setEnabled(true);
        webhook.setSubscribedEventsJson("[\"AI_REJECTED\",\"EMPTY\"]");
        webhook.setTargetUrlCiphertext("cipher-url");
        return webhook;
    }
}
