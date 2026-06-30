package com.aiclub.platform.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.support.converter.MessageConversionException;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

/**
 * Wiki 同步 RabbitMQ 拓扑。
 */
@Configuration
@EnableConfigurationProperties(WikiSyncRabbitProperties.class)
public class WikiSyncRabbitConfig {

    @Bean
    DirectExchange wikiSyncExchange(WikiSyncRabbitProperties properties) {
        return new DirectExchange(properties.getExchange(), true, false);
    }

    @Bean
    Queue wikiSyncQueue(WikiSyncRabbitProperties properties) {
        return new Queue(properties.getQueueName(), true, false, false, Map.of(
                "x-dead-letter-exchange", properties.getExchange(),
                "x-dead-letter-routing-key", properties.getDeadLetterRoutingKey()
        ));
    }

    @Bean
    Queue wikiSyncRetryQueue(WikiSyncRabbitProperties properties) {
        return new Queue(properties.getRetryQueueName(), true, false, false, Map.of(
                "x-message-ttl", properties.getRetryDelayMs(),
                "x-dead-letter-exchange", properties.getExchange(),
                "x-dead-letter-routing-key", properties.getRoutingKey()
        ));
    }

    @Bean
    Queue wikiSyncDeadLetterQueue(WikiSyncRabbitProperties properties) {
        return new Queue(properties.getDeadLetterQueueName(), true);
    }

    @Bean
    Binding wikiSyncBinding(Queue wikiSyncQueue, DirectExchange wikiSyncExchange,
                            WikiSyncRabbitProperties properties) {
        return BindingBuilder.bind(wikiSyncQueue).to(wikiSyncExchange).with(properties.getRoutingKey());
    }

    @Bean
    Binding wikiSyncRetryBinding(Queue wikiSyncRetryQueue, DirectExchange wikiSyncExchange,
                                 WikiSyncRabbitProperties properties) {
        return BindingBuilder.bind(wikiSyncRetryQueue).to(wikiSyncExchange).with(properties.getRetryRoutingKey());
    }

    @Bean
    Binding wikiSyncDeadLetterBinding(Queue wikiSyncDeadLetterQueue, DirectExchange wikiSyncExchange,
                                      WikiSyncRabbitProperties properties) {
        return BindingBuilder.bind(wikiSyncDeadLetterQueue).to(wikiSyncExchange).with(properties.getDeadLetterRoutingKey());
    }

    @Bean
    SimpleRabbitListenerContainerFactory wikiSyncRabbitListenerContainerFactory(ConnectionFactory connectionFactory,
                                                                               WikiSyncRabbitProperties properties,
                                                                               @Value("${spring.rabbitmq.listener.simple.auto-startup:true}") boolean autoStartup) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        int consumers = parseConsumerCount(properties.getConsumerConcurrency());
        factory.setConcurrentConsumers(consumers);
        factory.setMaxConcurrentConsumers(consumers);
        factory.setPrefetchCount(1);
        factory.setAutoStartup(autoStartup);
        // 业务意图：Wiki 同步队列只承载轻量 syncTaskId JSON 信号，消费者自行解析原始 AMQP Message。
        factory.setMessageConverter(new RawAmqpMessageConverter());
        return factory;
    }

    private static final class RawAmqpMessageConverter implements MessageConverter {
        @Override
        public Message toMessage(Object object, MessageProperties messageProperties) throws MessageConversionException {
            if (object instanceof Message message) {
                return message;
            }
            throw new MessageConversionException("Wiki 同步队列只支持原始 AMQP Message");
        }

        @Override
        public Object fromMessage(Message message) throws MessageConversionException {
            return message;
        }
    }

    private int parseConsumerCount(String concurrency) {
        if (concurrency == null || concurrency.isBlank()) {
            return 2;
        }
        String normalized = concurrency.trim();
        int separatorIndex = normalized.indexOf('-');
        String value = separatorIndex >= 0 ? normalized.substring(separatorIndex + 1) : normalized;
        try {
            return Math.max(1, Integer.parseInt(value.trim()));
        } catch (NumberFormatException exception) {
            return 2;
        }
    }
}
