package com.aiclub.platform.service;

import com.aiclub.platform.config.ExecutionTaskRabbitProperties;
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
 * 执行中心 RabbitMQ 消费者。
 */
@Service
public class ExecutionTaskQueueConsumer {
    private static final Logger LOGGER = LoggerFactory.getLogger(ExecutionTaskQueueConsumer.class);

    private final ExecutionDispatchService executionDispatchService;
    private final ExecutionTaskQueuePublisher queuePublisher;
    private final ExecutionTaskRabbitProperties properties;
    private final ObjectMapper objectMapper;

    public ExecutionTaskQueueConsumer(ExecutionDispatchService executionDispatchService,
                                      ExecutionTaskQueuePublisher queuePublisher,
                                      ExecutionTaskRabbitProperties properties,
                                      ObjectMapper objectMapper) {
        this.executionDispatchService = executionDispatchService;
        this.queuePublisher = queuePublisher;
        this.properties = properties;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    @RabbitListener(
            queues = "${platform.execution.task.rabbit.queue-name:execution.task.queue}",
            containerFactory = "executionTaskRabbitListenerContainerFactory"
    )
    public void consume(Message message) {
        Map<String, Object> payload = readPayload(message);
        Long executionTaskId = resolveLong(payload == null ? null : payload.get("executionTaskId"));
        int previousAttempts = resolveInt(payload == null ? null : payload.get("attempt"), 0);
        int attempt = previousAttempts + 1;
        if (executionTaskId == null) {
            return;
        }
        try {
            executionDispatchService.consumeQueuedTask(executionTaskId, previousAttempts > 0);
        } catch (RuntimeException exception) {
            LOGGER.warn("执行中心队列任务调度异常，executionTaskId={}, attempt={}", executionTaskId, attempt, exception);
            if (attempt >= properties.getMaxAttempts()) {
                queuePublisher.publishDeadLetter(executionTaskId, attempt, exception.getMessage());
                executionDispatchService.markTaskQueueFailed(executionTaskId, exception.getMessage());
                return;
            }
            executionDispatchService.markTaskRetrying(executionTaskId, exception.getMessage());
            queuePublisher.publishRetry(executionTaskId, attempt, exception.getMessage());
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
            LOGGER.warn("跳过非 JSON 的执行中心队列消息，contentType={}", contentType);
            return Map.of();
        }
        try {
            String json = new String(message.getBody(), StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception exception) {
            LOGGER.warn("跳过无法解析的执行中心队列消息", exception);
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
