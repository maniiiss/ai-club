package com.aiclub.platform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * 模型对比测试线程池配置。
 *
 * - benchmarkRunExecutor：负责"一次 run 的整体编排"，并发量低，每个 run 只占一个线程；
 * - benchmarkWorkerExecutor：负责"单个请求的实际发出"，吞吐量大，是用户配置的并发上限的真实承担者。
 *
 * 拆成两个池可以避免编排线程被工作线程饿死，且在 run 数量较多时仍能保持单 run 内部并发可控。
 */
@Configuration
public class BenchmarkAsyncConfig {

    @Bean(name = "benchmarkRunExecutor")
    public Executor benchmarkRunExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("benchmark-run-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(16);
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }

    @Bean(name = "benchmarkWorkerExecutor")
    public Executor benchmarkWorkerExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("benchmark-worker-");
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(64);
        executor.setQueueCapacity(0);
        executor.setKeepAliveSeconds(60);
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }
}
