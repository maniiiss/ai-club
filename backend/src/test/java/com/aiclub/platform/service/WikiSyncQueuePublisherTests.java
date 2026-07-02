package com.aiclub.platform.service;

import com.aiclub.platform.config.WikiSyncRabbitProperties;
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

class WikiSyncQueuePublisherTests {

    @Test
    void shouldPublishWikiSyncSignalAsJsonMessage() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        WikiSyncQueuePublisher publisher = new WikiSyncQueuePublisher(rabbitTemplate, properties, new ObjectMapper());

        publisher.publishNow(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI, 701L);

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(rabbitTemplate).send(eq(properties.getExchange()), eq(properties.getRoutingKey()), messageCaptor.capture());
        Message message = messageCaptor.getValue();
        String json = new String(message.getBody(), StandardCharsets.UTF_8);
        assertThat(message.getMessageProperties().getContentType()).isEqualTo(MessageProperties.CONTENT_TYPE_JSON);
        assertThat(json).contains("\"taskType\":\"PROJECT_WIKI\"");
        assertThat(json).contains("\"syncTaskId\":701");
    }

    @Test
    void shouldPublishRetryWithTaskTypeAttemptAndErrorMessage() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        WikiSyncQueuePublisher publisher = new WikiSyncQueuePublisher(rabbitTemplate, properties, new ObjectMapper());

        publisher.publishRetry(WikiSyncQueuePublisher.TYPE_SPACE_WIKI, 702L, 2, "Hindsight 暂不可用");

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(rabbitTemplate).send(eq(properties.getExchange()), eq(properties.getRetryRoutingKey()), messageCaptor.capture());
        String json = new String(messageCaptor.getValue().getBody(), StandardCharsets.UTF_8);
        assertThat(json).contains("\"taskType\":\"SPACE_WIKI\"");
        assertThat(json).contains("\"syncTaskId\":702");
        assertThat(json).contains("\"attempt\":2");
        assertThat(json).contains("Hindsight 暂不可用");
    }
}
