package com.aiclub.platform.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 执行中心 RabbitMQ 配置。
 * 业务意图：集中管理执行任务队列拓扑和消费参数，便于不同环境独立调整调度并发与重试节奏。
 */
@ConfigurationProperties(prefix = "platform.execution.task.rabbit")
public class ExecutionTaskRabbitProperties {
    private String exchange = "execution.task.exchange";
    private String queueName = "execution.task.queue";
    private String routingKey = "execution.task";
    private String retryQueueName = "execution.task.retry.queue";
    private String retryRoutingKey = "execution.task.retry";
    private String deadLetterQueueName = "execution.task.dlq";
    private String deadLetterRoutingKey = "execution.task.dead";
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
