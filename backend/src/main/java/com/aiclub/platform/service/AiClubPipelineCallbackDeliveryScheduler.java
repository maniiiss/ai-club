package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 周期性派发 AI Club Pipeline 的外部回调 webhook。
 */
@Service
public class AiClubPipelineCallbackDeliveryScheduler {

    private final AiClubPipelineAutomationService pipelineAutomationService;

    public AiClubPipelineCallbackDeliveryScheduler(AiClubPipelineAutomationService pipelineAutomationService) {
        this.pipelineAutomationService = pipelineAutomationService;
    }

    /**
     * 采用独立调度器发送回调，避免第三方 webhook 抖动阻塞主触发链路和状态同步链路。
     */
    @Scheduled(fixedDelayString = "${platform.cicd.callback-delivery.fixed-delay-ms:10000}")
    public void dispatchPendingCallbackDeliveries() {
        pipelineAutomationService.dispatchPendingCallbackDeliveries();
    }
}
