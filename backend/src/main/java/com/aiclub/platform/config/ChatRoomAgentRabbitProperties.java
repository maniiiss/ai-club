package com.aiclub.platform.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 聊天室 Agent RabbitMQ 配置。
 * 业务意图：集中管理队列拓扑和消费参数，便于本地、测试和生产环境分别覆盖。
 */
@ConfigurationProperties(prefix = "platform.chat.agent.rabbit")
public class ChatRoomAgentRabbitProperties {
    private String exchange = "chat.agent.exchange";
    private String queueName = "chat.agent.task.queue";
    private String routingKey = "chat.agent.task";
    private String retryQueueName = "chat.agent.retry.queue";
    private String retryRoutingKey = "chat.agent.retry";
    private String deadLetterQueueName = "chat.agent.dlq";
    private String deadLetterRoutingKey = "chat.agent.dead";
    private long retryDelayMs = 30000L;
    private int maxAttempts = 3;
    private String consumerConcurrency = "2";

    public String getExchange() { return exchange; }
    public void setExchange(String exchange) { this.exchange = exchange; }
    public String getQueueName() { return queueName; }
    public void setQueueName(String queueName) { this.queueName = queueName; }
    public String getRoutingKey() { return routingKey; }
    public void setRoutingKey(String routingKey) { this.routingKey = routingKey; }
    public String getRetryQueueName() { return retryQueueName; }
    public void setRetryQueueName(String retryQueueName) { this.retryQueueName = retryQueueName; }
    public String getRetryRoutingKey() { return retryRoutingKey; }
    public void setRetryRoutingKey(String retryRoutingKey) { this.retryRoutingKey = retryRoutingKey; }
    public String getDeadLetterQueueName() { return deadLetterQueueName; }
    public void setDeadLetterQueueName(String deadLetterQueueName) { this.deadLetterQueueName = deadLetterQueueName; }
    public String getDeadLetterRoutingKey() { return deadLetterRoutingKey; }
    public void setDeadLetterRoutingKey(String deadLetterRoutingKey) { this.deadLetterRoutingKey = deadLetterRoutingKey; }
    public long getRetryDelayMs() { return retryDelayMs; }
    public void setRetryDelayMs(long retryDelayMs) { this.retryDelayMs = retryDelayMs; }
    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public String getConsumerConcurrency() { return consumerConcurrency; }
    public void setConsumerConcurrency(String consumerConcurrency) { this.consumerConcurrency = consumerConcurrency; }
}
