package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 空间化 Wiki Hindsight 同步补偿调度器。
 */
@Service
public class WikiSpaceSyncScheduler {

    private final WikiSpaceService wikiSpaceService;

    public WikiSpaceSyncScheduler(WikiSpaceService wikiSpaceService) {
        this.wikiSpaceService = wikiSpaceService;
    }

    /**
     * 周期性扫描待同步任务，只补发 RabbitMQ 信号，实际同步由队列消费者领取执行。
     */
    @Scheduled(fixedDelay = 30000L)
    public void runPendingSyncTasks() {
        wikiSpaceService.processPendingSyncTasks();
    }
}
