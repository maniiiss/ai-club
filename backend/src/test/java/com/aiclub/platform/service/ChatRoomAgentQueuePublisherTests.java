package com.aiclub.platform.service;

import com.aiclub.platform.config.ChatRoomAgentRabbitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ChatRoomAgentQueuePublisherTests {

    @Test
    void shouldPublishTaskSignalAsJsonMessage() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        ChatRoomAgentRabbitProperties properties = new ChatRoomAgentRabbitProperties();
        ChatRoomAgentQueuePublisher publisher = new ChatRoomAgentQueuePublisher(
                rabbitTemplate,
                properties,
                new ObjectMapper()
        );
        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);

        publisher.publishNow(801L);

        verify(rabbitTemplate).send(
                org.mockito.ArgumentMatchers.eq(properties.getExchange()),
                org.mockito.ArgumentMatchers.eq(properties.getRoutingKey()),
                messageCaptor.capture()
        );
        Message message = messageCaptor.getValue();
        assertThat(message.getMessageProperties().getContentType()).isEqualTo(MessageProperties.CONTENT_TYPE_JSON);
        assertThat(new String(message.getBody(), StandardCharsets.UTF_8)).contains("\"taskId\":801");
    }
}
