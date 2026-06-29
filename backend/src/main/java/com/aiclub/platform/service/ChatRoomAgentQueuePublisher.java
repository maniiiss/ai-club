package com.aiclub.platform.service;

import com.aiclub.platform.config.ChatRoomAgentRabbitProperties;
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
 * 聊天室 Agent 队列发布器。
 * 业务意图：数据库保存任务事实后，向 RabbitMQ 发布轻量 taskId 信号。
 */
@Service
public class ChatRoomAgentQueuePublisher {
    private final RabbitTemplate rabbitTemplate;
    private final ChatRoomAgentRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public ChatRoomAgentQueuePublisher(RabbitTemplate rabbitTemplate,
                                       ChatRoomAgentRabbitProperties properties,
                                       ObjectMapper objectMapper) {
        this.rabbitTemplate = rabbitTemplate;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public void publishAfterCommit(Long taskId) {
        if (taskId == null) {
            return;
        }
        Runnable publish = () -> publishNow(taskId);
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

    public void publishNow(Long taskId) {
        sendJson(properties.getRoutingKey(), Map.of("taskId", taskId));
    }

    public void publishRetry(Long taskId, int attempt, String errorMessage) {
        sendJson(properties.getRetryRoutingKey(), Map.of(
                "taskId", taskId,
                "attempt", attempt,
                "errorMessage", errorMessage == null ? "" : errorMessage
        ));
    }

    public void publishDeadLetter(Long taskId, int attempt, String errorMessage) {
        sendJson(properties.getDeadLetterRoutingKey(), Map.of(
                "taskId", taskId,
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
            throw new IllegalStateException("发布聊天室 Agent 队列消息失败", exception);
        }
    }
}
