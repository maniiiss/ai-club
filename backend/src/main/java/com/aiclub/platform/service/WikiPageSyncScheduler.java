package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Wiki Hindsight 同步补偿调度器，周期性补发出站任务队列信号。
 */
@Service
public class WikiPageSyncScheduler {

    private final WikiPageService wikiPageService;

    public WikiPageSyncScheduler(WikiPageService wikiPageService) {
        this.wikiPageService = wikiPageService;
    }

    /**
     * 固定间隔扫描待同步任务，只补发 RabbitMQ 信号，实际同步由队列消费者领取执行。
     */
    @Scheduled(fixedDelay = 30000L)
    public void runPendingSyncTasks() {
        wikiPageService.processPendingSyncTasks();
    }
}
