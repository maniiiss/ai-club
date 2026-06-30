package com.aiclub.platform.service;

import com.aiclub.platform.config.ExecutionTaskRabbitProperties;
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
 * 执行中心队列发布器。
 * 业务意图：执行任务事实先保存到数据库，RabbitMQ 只发布轻量 executionTaskId 调度信号。
 */
@Service
public class ExecutionTaskQueuePublisher {
    private final RabbitTemplate rabbitTemplate;
    private final ExecutionTaskRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public ExecutionTaskQueuePublisher(RabbitTemplate rabbitTemplate,
                                       ExecutionTaskRabbitProperties properties,
                                       ObjectMapper objectMapper) {
        this.rabbitTemplate = rabbitTemplate;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public void publishAfterCommit(Long executionTaskId) {
        if (executionTaskId == null) {
            return;
        }
        Runnable publish = () -> publishNow(executionTaskId);
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

    public void publishNow(Long executionTaskId) {
        sendJson(properties.getRoutingKey(), Map.of("executionTaskId", executionTaskId));
    }

    public void publishRetry(Long executionTaskId, int attempt, String errorMessage) {
        sendJson(properties.getRetryRoutingKey(), Map.of(
                "executionTaskId", executionTaskId,
                "attempt", attempt,
                "errorMessage", errorMessage == null ? "" : errorMessage
        ));
    }

    public void publishDeadLetter(Long executionTaskId, int attempt, String errorMessage) {
        sendJson(properties.getDeadLetterRoutingKey(), Map.of(
                "executionTaskId", executionTaskId,
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
            throw new IllegalStateException("发布执行中心队列消息失败", exception);
        }
    }
}
