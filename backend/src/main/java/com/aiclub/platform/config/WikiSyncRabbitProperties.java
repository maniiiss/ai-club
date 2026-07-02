package com.aiclub.platform.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Wiki 同步 RabbitMQ 配置。
 * 业务意图：Wiki 同步任务事实仍保存在数据库，队列只承载轻量唤醒信号。
 */
@ConfigurationProperties(prefix = "platform.wiki.sync.rabbit")
public class WikiSyncRabbitProperties {
    private String exchange = "wiki.sync.exchange";
    private String queueName = "wiki.sync.queue";
    private String routingKey = "wiki.sync";
    private String retryQueueName = "wiki.sync.retry.queue";
    private String retryRoutingKey = "wiki.sync.retry";
    private String deadLetterQueueName = "wiki.sync.dlq";
    private String deadLetterRoutingKey = "wiki.sync.dead";
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
