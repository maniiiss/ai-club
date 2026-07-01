package com.aiclub.platform.service;

import com.aiclub.platform.config.WikiSyncRabbitProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;

import java.nio.charset.StandardCharsets;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WikiSyncQueueConsumerTests {

    @Test
    void shouldConsumeProjectWikiSyncMessage() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSyncQueuePublisher queuePublisher = mock(WikiSyncQueuePublisher.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        WikiSyncQueueConsumer consumer = new WikiSyncQueueConsumer(
                wikiPageService, wikiSpaceService, queuePublisher, properties, new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"taskType\":\"PROJECT_WIKI\",\"syncTaskId\":701}"));

        verify(wikiPageService).consumeQueuedSyncTask(701L, false);
        verify(wikiSpaceService, never()).consumeQueuedSyncTask(eq(701L), eq(false));
    }

    @Test
    void shouldConsumeSpaceWikiRetryMessageWithRetryFlag() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSyncQueuePublisher queuePublisher = mock(WikiSyncQueuePublisher.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        WikiSyncQueueConsumer consumer = new WikiSyncQueueConsumer(
                wikiPageService, wikiSpaceService, queuePublisher, properties, new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"taskType\":\"SPACE_WIKI\",\"syncTaskId\":702,\"attempt\":1}"));

        verify(wikiSpaceService).consumeQueuedSyncTask(702L, true);
        verify(wikiPageService, never()).consumeQueuedSyncTask(eq(702L), eq(true));
    }

    @Test
    void shouldPublishRetryWhenConsumerEntryFails() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSyncQueuePublisher queuePublisher = mock(WikiSyncQueuePublisher.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        when(wikiPageService.consumeQueuedSyncTask(703L, false)).thenThrow(new IllegalStateException("数据库暂不可用"));
        WikiSyncQueueConsumer consumer = new WikiSyncQueueConsumer(
                wikiPageService, wikiSpaceService, queuePublisher, properties, new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"taskType\":\"PROJECT_WIKI\",\"syncTaskId\":703}"));

        verify(queuePublisher).publishRetry(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI, 703L, 1, "数据库暂不可用");
    }

    @Test
    void shouldDeadLetterAfterMaxAttempts() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSyncQueuePublisher queuePublisher = mock(WikiSyncQueuePublisher.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        properties.setMaxAttempts(2);
        when(wikiSpaceService.consumeQueuedSyncTask(704L, true)).thenThrow(new IllegalStateException("数据库持续不可用"));
        WikiSyncQueueConsumer consumer = new WikiSyncQueueConsumer(
                wikiPageService, wikiSpaceService, queuePublisher, properties, new ObjectMapper()
        );

        consumer.consume(jsonMessage("{\"taskType\":\"SPACE_WIKI\",\"syncTaskId\":704,\"attempt\":1}"));

        verify(queuePublisher).publishDeadLetter(WikiSyncQueuePublisher.TYPE_SPACE_WIKI, 704L, 2, "数据库持续不可用");
        verify(queuePublisher, never()).publishRetry(eq(WikiSyncQueuePublisher.TYPE_SPACE_WIKI), eq(704L), eq(2), eq("数据库持续不可用"));
    }

    @Test
    void shouldAckInvalidMessageAndWaitForCompensationRepublish() {
        WikiPageService wikiPageService = mock(WikiPageService.class);
        WikiSpaceService wikiSpaceService = mock(WikiSpaceService.class);
        WikiSyncQueuePublisher queuePublisher = mock(WikiSyncQueuePublisher.class);
        WikiSyncRabbitProperties properties = new WikiSyncRabbitProperties();
        WikiSyncQueueConsumer consumer = new WikiSyncQueueConsumer(
                wikiPageService, wikiSpaceService, queuePublisher, properties, new ObjectMapper()
        );
        Message invalid = MessageBuilder.withBody("legacy".getBytes(StandardCharsets.UTF_8))
                .setContentType(MessageProperties.CONTENT_TYPE_SERIALIZED_OBJECT)
                .build();

        consumer.consume(invalid);

        verify(wikiPageService, never()).consumeQueuedSyncTask(eq(1L), eq(false));
        verify(wikiSpaceService, never()).consumeQueuedSyncTask(eq(1L), eq(false));
        verify(queuePublisher, never()).publishRetry(eq(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI), eq(1L), eq(1), eq(""));
    }

    private Message jsonMessage(String json) {
        return MessageBuilder.withBody(json.getBytes(StandardCharsets.UTF_8))
                .setContentType(MessageProperties.CONTENT_TYPE_JSON)
                .setContentEncoding(StandardCharsets.UTF_8.name())
                .build();
    }
}
