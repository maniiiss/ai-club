package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 周期性轮询 Woodpecker 最近运行，并把状态同步回 AI Club 本地快照与摘要。
 */
@Service
public class WoodpeckerPipelineRunSyncScheduler {

    private final AiClubPipelineAutomationService pipelineAutomationService;

    public WoodpeckerPipelineRunSyncScheduler(AiClubPipelineAutomationService pipelineAutomationService) {
        this.pipelineAutomationService = pipelineAutomationService;
    }

    /**
     * 当前版本不接 Woodpecker 入站 webhook，因此通过固定间隔轮询补齐状态变化与外部回调调度入口。
     */
    @Scheduled(fixedDelayString = "${platform.cicd.run-sync.fixed-delay-ms:30000}")
    public void syncRecentRuns() {
        pipelineAutomationService.syncRecentRuns();
    }
}
