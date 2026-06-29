package com.aiclub.platform.service;

import com.aiclub.platform.config.ChatRoomAgentRabbitProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 聊天室 Agent RabbitMQ 消费者。
 */
@Service
public class ChatRoomAgentQueueConsumer {
    private static final Logger LOGGER = LoggerFactory.getLogger(ChatRoomAgentQueueConsumer.class);

    private final ChatRoomAgentService chatRoomAgentService;
    private final ChatRoomAgentQueuePublisher queuePublisher;
    private final ChatRoomAgentRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public ChatRoomAgentQueueConsumer(ChatRoomAgentService chatRoomAgentService,
                                      ChatRoomAgentQueuePublisher queuePublisher,
                                      ChatRoomAgentRabbitProperties properties,
                                      ObjectMapper objectMapper) {
        this.chatRoomAgentService = chatRoomAgentService;
        this.queuePublisher = queuePublisher;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    @RabbitListener(
            queues = "${platform.chat.agent.rabbit.queue-name:chat.agent.task.queue}",
            containerFactory = "chatAgentRabbitListenerContainerFactory"
    )
    public void consume(Message message) {
        Map<String, Object> payload = readPayload(message);
        Long taskId = resolveLong(payload == null ? null : payload.get("taskId"));
        int previousAttempts = resolveInt(payload == null ? null : payload.get("attempt"), 0);
        int attempt = previousAttempts + 1;
        if (taskId == null) {
            return;
        }
        try {
            chatRoomAgentService.runTask(taskId, previousAttempts > 0);
        } catch (RuntimeException exception) {
            LOGGER.warn("聊天室 Agent 队列任务执行异常，taskId={}, attempt={}", taskId, attempt, exception);
            if (attempt >= properties.getMaxAttempts()) {
                queuePublisher.publishDeadLetter(taskId, attempt, exception.getMessage());
                chatRoomAgentService.markTaskError(taskId, exception.getMessage());
                return;
            }
            chatRoomAgentService.markTaskRetrying(taskId, exception.getMessage());
            queuePublisher.publishRetry(taskId, attempt, exception.getMessage());
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
            LOGGER.warn("跳过非 JSON 的聊天室 Agent 队列消息，contentType={}", contentType);
            return Map.of();
        }
        try {
            String json = new String(message.getBody(), StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            LOGGER.warn("跳过无法解析的聊天室 Agent 队列消息", exception);
            return Map.of();
        }
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
