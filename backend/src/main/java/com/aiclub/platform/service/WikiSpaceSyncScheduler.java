package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 空间化 Wiki Hindsight 同步调度器。
 */
@Service
public class WikiSpaceSyncScheduler {

    private final WikiSpaceService wikiSpaceService;

    public WikiSpaceSyncScheduler(WikiSpaceService wikiSpaceService) {
        this.wikiSpaceService = wikiSpaceService;
    }

    /**
     * 周期性处理空间化 Wiki 页面同步任务。
     */
    @Scheduled(fixedDelay = 30000L)
    public void runPendingSyncTasks() {
        wikiSpaceService.processPendingSyncTasks();
    }
}
