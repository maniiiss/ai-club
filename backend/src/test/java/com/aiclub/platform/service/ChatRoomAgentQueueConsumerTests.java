package com.aiclub.platform.service;

import com.aiclub.platform.config.ChatRoomAgentRabbitProperties;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class ChatRoomAgentQueueConsumerTests {

    @Test
    void shouldMarkTaskRetryingBeforePublishingRetryMessage() {
        ChatRoomAgentService chatRoomAgentService = mock(ChatRoomAgentService.class);
        ChatRoomAgentQueuePublisher queuePublisher = mock(ChatRoomAgentQueuePublisher.class);
        ChatRoomAgentRabbitProperties properties = new ChatRoomAgentRabbitProperties();
        properties.setMaxAttempts(3);
        org.mockito.Mockito.doThrow(new IllegalStateException("Hermes 暂不可用"))
                .when(chatRoomAgentService)
                .runTask(701L, false);
        ChatRoomAgentQueueConsumer consumer = new ChatRoomAgentQueueConsumer(chatRoomAgentService, queuePublisher, properties,
                new com.fasterxml.jackson.databind.ObjectMapper());

        consumer.consume(jsonMessage("{\"taskId\":701}"));

        verify(chatRoomAgentService).markTaskRetrying(701L, "Hermes 暂不可用");
        verify(queuePublisher).publishRetry(701L, 1, "Hermes 暂不可用");
    }

    @Test
    void shouldAllowRetryingTaskOnlyForRetryQueueMessage() {
        ChatRoomAgentService chatRoomAgentService = mock(ChatRoomAgentService.class);
        ChatRoomAgentQueuePublisher queuePublisher = mock(ChatRoomAgentQueuePublisher.class);
        ChatRoomAgentRabbitProperties properties = new ChatRoomAgentRabbitProperties();
        ChatRoomAgentQueueConsumer consumer = new ChatRoomAgentQueueConsumer(chatRoomAgentService, queuePublisher, properties,
                new com.fasterxml.jackson.databind.ObjectMapper());

        consumer.consume(jsonMessage("{\"taskId\":702,\"attempt\":1}"));

        verify(chatRoomAgentService).runTask(702L, true);
    }

    @Test
    void shouldAckUnsupportedLegacySerializedMessageAndWaitForCompensationRepublish() {
        ChatRoomAgentService chatRoomAgentService = mock(ChatRoomAgentService.class);
        ChatRoomAgentQueuePublisher queuePublisher = mock(ChatRoomAgentQueuePublisher.class);
        ChatRoomAgentRabbitProperties properties = new ChatRoomAgentRabbitProperties();
        ChatRoomAgentQueueConsumer consumer = new ChatRoomAgentQueueConsumer(chatRoomAgentService, queuePublisher, properties,
                new com.fasterxml.jackson.databind.ObjectMapper());

        consumer.consume(MessageBuilder.withBody(new byte[] {1, 2, 3})
                .setContentType(MessageProperties.CONTENT_TYPE_SERIALIZED_OBJECT)
                .build());

        verify(chatRoomAgentService, never()).runTask(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    private Message jsonMessage(String json) {
        return MessageBuilder.withBody(json.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                .build();
    }
}
