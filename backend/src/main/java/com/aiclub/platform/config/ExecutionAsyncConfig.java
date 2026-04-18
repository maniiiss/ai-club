package com.aiclub.platform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * 执行中心异步线程池配置。
 * 调度线程只负责领任务，真实执行交给独立线程池，避免长任务阻塞定时轮询。
 */
@Configuration
public class ExecutionAsyncConfig {

    @Bean(name = "executionTaskExecutor")
    public Executor executionTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("execution-task-");
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(64);
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }
}
