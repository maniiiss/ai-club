package com.aiclub.platform.service;

import com.aiclub.platform.config.WikiSyncRabbitProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Wiki 同步 RabbitMQ 消费者。
 */
@Service
public class WikiSyncQueueConsumer {
    private static final Logger LOGGER = LoggerFactory.getLogger(WikiSyncQueueConsumer.class);

    private final WikiPageService wikiPageService;
    private final WikiSpaceService wikiSpaceService;
    private final WikiSyncQueuePublisher queuePublisher;
    private final WikiSyncRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public WikiSyncQueueConsumer(WikiPageService wikiPageService,
                                 WikiSpaceService wikiSpaceService,
                                 WikiSyncQueuePublisher queuePublisher,
                                 WikiSyncRabbitProperties properties,
                                 ObjectMapper objectMapper) {
        this.wikiPageService = wikiPageService;
        this.wikiSpaceService = wikiSpaceService;
        this.queuePublisher = queuePublisher;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    @RabbitListener(
            queues = "${platform.wiki.sync.rabbit.queue-name:wiki.sync.queue}",
            containerFactory = "wikiSyncRabbitListenerContainerFactory"
    )
    public void consume(Message message) {
        Map<String, Object> payload = readPayload(message);
        String taskType = resolveText(payload == null ? null : payload.get("taskType"));
        Long syncTaskId = resolveLong(payload == null ? null : payload.get("syncTaskId"));
        int previousAttempts = resolveInt(payload == null ? null : payload.get("attempt"), 0);
        int attempt = previousAttempts + 1;
        if (syncTaskId == null || taskType == null) {
            return;
        }
        try {
            if (WikiSyncQueuePublisher.TYPE_PROJECT_WIKI.equals(taskType)) {
                wikiPageService.consumeQueuedSyncTask(syncTaskId, previousAttempts > 0);
            } else if (WikiSyncQueuePublisher.TYPE_SPACE_WIKI.equals(taskType)) {
                wikiSpaceService.consumeQueuedSyncTask(syncTaskId, previousAttempts > 0);
            } else {
                LOGGER.warn("跳过未知类型的 Wiki 同步队列消息，taskType={}", taskType);
            }
        } catch (RuntimeException exception) {
            LOGGER.warn("Wiki 同步队列任务调度异常，taskType={}, syncTaskId={}, attempt={}",
                    taskType, syncTaskId, attempt, exception);
            if (attempt >= properties.getMaxAttempts()) {
                queuePublisher.publishDeadLetter(taskType, syncTaskId, attempt, exception.getMessage());
                markTaskQueueFailed(taskType, syncTaskId, exception.getMessage());
                return;
            }
            queuePublisher.publishRetry(taskType, syncTaskId, attempt, exception.getMessage());
        }
    }

    private void markTaskQueueFailed(String taskType, Long syncTaskId, String errorMessage) {
        if (WikiSyncQueuePublisher.TYPE_PROJECT_WIKI.equals(taskType)) {
            wikiPageService.markQueuedSyncTaskFailed(syncTaskId, errorMessage);
        } else if (WikiSyncQueuePublisher.TYPE_SPACE_WIKI.equals(taskType)) {
            wikiSpaceService.markQueuedSyncTaskFailed(syncTaskId, errorMessage);
        }
    }

    private Map<String, Object> readPayload(Message message) {
        if (message == null || message.getBody() == null || message.getBody().length == 0) {
            return Map.of();
        }
        String contentType = message.getMessageProperties() == null
                ? ""
                : message.getMessageProperties().getContentType();
        if (!MessageProperties.CONTENT_TYPE_JSON.equalsIgnoreCase(contentType)
                && !"application/json".equalsIgnoreCase(contentType)
                && !"text/plain".equalsIgnoreCase(contentType)) {
            LOGGER.warn("跳过非 JSON 的 Wiki 同步队列消息，contentType={}", contentType);
            return Map.of();
        }
        try {
            String json = new String(message.getBody(), StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            LOGGER.warn("跳过无法解析的 Wiki 同步队列消息", exception);
            return Map.of();
        }
    }

    private String resolveText(Object value) {
        if (value instanceof String text && !text.isBlank()) {
            return text.trim();
        }
        return null;
    }

    private Long resolveLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Long.parseLong(text.trim());
        }
        return null;
    }

    private int resolveInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            return Integer.parseInt(text.trim());
        }
        return fallback;
    }
}
