package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Wiki Hindsight 同步调度器，周期性消费出站任务并做失败补偿。
 */
@Service
public class WikiPageSyncScheduler {

    private final WikiPageService wikiPageService;

    public WikiPageSyncScheduler(WikiPageService wikiPageService) {
        this.wikiPageService = wikiPageService;
    }

    /**
     * 固定间隔扫描待同步任务，避免用户保存页面时等待外部 Hindsight 服务。
     */
    @Scheduled(fixedDelay = 30000L)
    public void runPendingSyncTasks() {
        wikiPageService.processPendingSyncTasks();
    }
}
