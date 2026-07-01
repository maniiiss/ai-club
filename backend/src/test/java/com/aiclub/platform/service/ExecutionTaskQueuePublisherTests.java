package com.aiclub.platform.service;

import com.aiclub.platform.config.ExecutionTaskRabbitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ExecutionTaskQueuePublisherTests {

    @Test
    void shouldPublishExecutionTaskSignalAsJsonMessage() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        ExecutionTaskQueuePublisher publisher = new ExecutionTaskQueuePublisher(
                rabbitTemplate,
                properties,
                new ObjectMapper()
        );
        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);

        publisher.publishNow(801L);

        verify(rabbitTemplate).send(eq(properties.getExchange()), eq(properties.getRoutingKey()), messageCaptor.capture());
        Message message = messageCaptor.getValue();
        assertThat(message.getMessageProperties().getContentType()).isEqualTo(MessageProperties.CONTENT_TYPE_JSON);
        assertThat(new String(message.getBody(), StandardCharsets.UTF_8)).contains("\"executionTaskId\":801");
    }

    @Test
    void shouldPublishRetryWithAttemptAndErrorMessage() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        ExecutionTaskRabbitProperties properties = new ExecutionTaskRabbitProperties();
        ExecutionTaskQueuePublisher publisher = new ExecutionTaskQueuePublisher(
                rabbitTemplate,
                properties,
                new ObjectMapper()
        );
        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);

        publisher.publishRetry(802L, 2, "RabbitMQ 调度入口异常");

        verify(rabbitTemplate).send(eq(properties.getExchange()), eq(properties.getRetryRoutingKey()), messageCaptor.capture());
        String json = new String(messageCaptor.getValue().getBody(), StandardCharsets.UTF_8);
        assertThat(json).contains("\"executionTaskId\":802");
        assertThat(json).contains("\"attempt\":2");
        assertThat(json).contains("RabbitMQ 调度入口异常");
    }
}
