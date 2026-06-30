package com.aiclub.platform.service;

import com.aiclub.platform.config.WikiSyncRabbitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Wiki 同步队列发布器。
 * 业务意图：Wiki 同步任务事实先落库，RabbitMQ 只发布轻量 syncTaskId 唤醒信号。
 */
@Service
public class WikiSyncQueuePublisher {
    public static final String TYPE_PROJECT_WIKI = "PROJECT_WIKI";
    public static final String TYPE_SPACE_WIKI = "SPACE_WIKI";

    private final RabbitTemplate rabbitTemplate;
    private final WikiSyncRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public WikiSyncQueuePublisher(RabbitTemplate rabbitTemplate,
                                  WikiSyncRabbitProperties properties,
                                  ObjectMapper objectMapper) {
        this.rabbitTemplate = rabbitTemplate;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public void publishAfterCommit(String taskType, Long syncTaskId) {
        if (syncTaskId == null || taskType == null || taskType.isBlank()) {
            return;
        }
        Runnable publish = () -> publishNow(taskType, syncTaskId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish.run();
                }
            });
        } else {
            publish.run();
        }
    }

    public void publishNow(String taskType, Long syncTaskId) {
        sendJson(properties.getRoutingKey(), Map.of(
                "taskType", taskType,
                "syncTaskId", syncTaskId
        ));
    }

    public void publishRetry(String taskType, Long syncTaskId, int attempt, String errorMessage) {
        sendJson(properties.getRetryRoutingKey(), Map.of(
                "taskType", taskType,
                "syncTaskId", syncTaskId,
                "attempt", attempt,
                "errorMessage", errorMessage == null ? "" : errorMessage
        ));
    }

    public void publishDeadLetter(String taskType, Long syncTaskId, int attempt, String errorMessage) {
        sendJson(properties.getDeadLetterRoutingKey(), Map.of(
                "taskType", taskType,
                "syncTaskId", syncTaskId,
                "attempt", attempt,
                "errorMessage", errorMessage == null ? "" : errorMessage
        ));
    }

    private void sendJson(String routingKey, Map<String, Object> payload) {
        try {
            byte[] body = objectMapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
            Message message = MessageBuilder.withBody(body)
                    .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                    .setContentEncoding(StandardCharsets.UTF_8.name())
                    .build();
            rabbitTemplate.send(properties.getExchange(), routingKey, message);
        } catch (Exception exception) {
            throw new IllegalStateException("发布 Wiki 同步队列消息失败", exception);
        }
    }
}
