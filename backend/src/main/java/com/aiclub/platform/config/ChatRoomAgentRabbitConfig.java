package com.aiclub.platform.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.MessageConversionException;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

/**
 * 聊天室 Agent RabbitMQ 拓扑。
 */
@Configuration
@EnableConfigurationProperties(ChatRoomAgentRabbitProperties.class)
public class ChatRoomAgentRabbitConfig {

    @Bean
    DirectExchange chatAgentExchange(ChatRoomAgentRabbitProperties properties) {
        return new DirectExchange(properties.getExchange(), true, false);
    }

    @Bean
    Queue chatAgentTaskQueue(ChatRoomAgentRabbitProperties properties) {
        return new Queue(properties.getQueueName(), true, false, false, Map.of(
                "x-dead-letter-exchange", properties.getExchange(),
                "x-dead-letter-routing-key", properties.getDeadLetterRoutingKey()
        ));
    }

    @Bean
    Queue chatAgentRetryQueue(ChatRoomAgentRabbitProperties properties) {
        return new Queue(properties.getRetryQueueName(), true, false, false, Map.of(
                "x-message-ttl", properties.getRetryDelayMs(),
                "x-dead-letter-exchange", properties.getExchange(),
                "x-dead-letter-routing-key", properties.getRoutingKey()
        ));
    }

    @Bean
    Queue chatAgentDeadLetterQueue(ChatRoomAgentRabbitProperties properties) {
        return new Queue(properties.getDeadLetterQueueName(), true);
    }

    @Bean
    Binding chatAgentTaskBinding(Queue chatAgentTaskQueue, DirectExchange chatAgentExchange,
                                 ChatRoomAgentRabbitProperties properties) {
        return BindingBuilder.bind(chatAgentTaskQueue).to(chatAgentExchange).with(properties.getRoutingKey());
    }

    @Bean
    Binding chatAgentRetryBinding(Queue chatAgentRetryQueue, DirectExchange chatAgentExchange,
                                  ChatRoomAgentRabbitProperties properties) {
        return BindingBuilder.bind(chatAgentRetryQueue).to(chatAgentExchange).with(properties.getRetryRoutingKey());
    }

    @Bean
    Binding chatAgentDeadLetterBinding(Queue chatAgentDeadLetterQueue, DirectExchange chatAgentExchange,
                                       ChatRoomAgentRabbitProperties properties) {
        return BindingBuilder.bind(chatAgentDeadLetterQueue).to(chatAgentExchange).with(properties.getDeadLetterRoutingKey());
    }

    @Bean
    SimpleRabbitListenerContainerFactory chatAgentRabbitListenerContainerFactory(ConnectionFactory connectionFactory,
                                                                                ChatRoomAgentRabbitProperties properties) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        int consumers = parseConsumerCount(properties.getConsumerConcurrency());
        factory.setConcurrentConsumers(consumers);
        factory.setMaxConcurrentConsumers(consumers);
        factory.setPrefetchCount(1);
        // 业务意图：Agent 队列只承载轻量 taskId JSON 信号，消费者自行解析原始 AMQP Message。
        // 这样历史 Java 序列化消息也会被交给消费者跳过，不会卡在 Spring AMQP 反序列化阶段。
        factory.setMessageConverter(new RawAmqpMessageConverter());
        return factory;
    }

    private static final class RawAmqpMessageConverter implements MessageConverter {
        @Override
        public Message toMessage(Object object, MessageProperties messageProperties) throws MessageConversionException {
            if (object instanceof Message message) {
                return message;
            }
            throw new MessageConversionException("聊天室 Agent 队列只支持原始 AMQP Message");
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
