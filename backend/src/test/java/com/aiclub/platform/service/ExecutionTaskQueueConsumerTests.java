package com.aiclub.platform.service;

import com.aiclub.platform.config.ExecutionTaskRabbitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;

import java.nio.charset.StandardCharsets;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class ExecutionTaskQueueConsumerTests {

    @Test
    void shouldConsumePendingExecutionTaskMessage() {
        ExecutionDispatchService executionDispatchService = mock(ExecutionDispatchService.class);
        ExecutionTaskQueuePublisher queuePublisher = mock(ExecutionTaskQueuePublisher.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        ExecutionTaskQueueConsumer consumer = new ExecutionTaskQueueConsumer(
                executionDispatchService,
                queuePublisher,
                properties,
                new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"executionTaskId\":701}"));

        verify(executionDispatchService).consumeQueuedTask(701L, false);
    }

    @Test
    void shouldAllowRetryingTaskOnlyForRetryQueueMessage() {
        ExecutionDispatchService executionDispatchService = mock(ExecutionDispatchService.class);
        ExecutionTaskQueuePublisher queuePublisher = mock(ExecutionTaskQueuePublisher.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        ExecutionTaskQueueConsumer consumer = new ExecutionTaskQueueConsumer(
                executionDispatchService,
                queuePublisher,
                properties,
                new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"executionTaskId\":702,\"attempt\":1}"));

        verify(executionDispatchService).consumeQueuedTask(702L, true);
    }

    @Test
    void shouldMarkTaskRetryingBeforePublishingRetryMessage() {
        ExecutionDispatchService executionDispatchService = mock(ExecutionDispatchService.class);
        ExecutionTaskQueuePublisher queuePublisher = mock(ExecutionTaskQueuePublisher.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        properties.setMaxAttempts(3);
        org.mockito.Mockito.doThrow(new IllegalStateException("数据库暂不可用"))
                .when(executionDispatchService)
                .consumeQueuedTask(703L, false);
        ExecutionTaskQueueConsumer consumer = new ExecutionTaskQueueConsumer(
                executionDispatchService,
                queuePublisher,
                properties,
                new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"executionTaskId\":703}"));

        verify(executionDispatchService).markTaskRetrying(703L, "数据库暂不可用");
        verify(queuePublisher).publishRetry(703L, 1, "数据库暂不可用");
    }

    @Test
    void shouldDeadLetterAfterMaxAttempts() {
        ExecutionDispatchService executionDispatchService = mock(ExecutionDispatchService.class);
        ExecutionTaskQueuePublisher queuePublisher = mock(ExecutionTaskQueuePublisher.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        properties.setMaxAttempts(2);
        org.mockito.Mockito.doThrow(new IllegalStateException("数据库持续不可用"))
                .when(executionDispatchService)
                .consumeQueuedTask(704L, true);
        ExecutionTaskQueueConsumer consumer = new ExecutionTaskQueueConsumer(
                executionDispatchService,
                queuePublisher,
                properties,
                new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"executionTaskId\":704,\"attempt\":1}"));

        verify(queuePublisher).publishDeadLetter(704L, 2, "数据库持续不可用");
        verify(executionDispatchService).markTaskQueueFailed(704L, "数据库持续不可用");
    }

    @Test
    void shouldAckInvalidMessageAndWaitForCompensationRepublish() {
        ExecutionDispatchService executionDispatchService = mock(ExecutionDispatchService.class);
        ExecutionTaskQueuePublisher queuePublisher = mock(ExecutionTaskQueuePublisher.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        ExecutionTaskQueueConsumer consumer = new ExecutionTaskQueueConsumer(
                executionDispatchService,
                queuePublisher,
                properties,
                new ObjectMapper()
        );

        consumer.consume(MessageBuilder.withBody(new byte[] {1, 2, 3})
                .setContentType(MessageProperties.CONTENT_TYPE_SERIALIZED_OBJECT)
                .build());

        verify(executionDispatchService, never()).consumeQueuedTask(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyBoolean()
        );
    }

    private Message jsonMessage(String json) {
        return MessageBuilder.withBody(json.getBytes(StandardCharsets.UTF_8))
                .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                .build();
    }
}
