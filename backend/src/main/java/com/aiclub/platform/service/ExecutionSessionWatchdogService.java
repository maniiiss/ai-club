package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 流式执行 watchdog。
 * 定时检查 live stream 步骤是否超过心跳/空闲阈值，并补失败收口。
 */
@Service
public class ExecutionSessionWatchdogService {

    private final ExecutionAsyncSessionService executionAsyncSessionService;

    public ExecutionSessionWatchdogService(ExecutionAsyncSessionService executionAsyncSessionService) {
        this.executionAsyncSessionService = executionAsyncSessionService;
    }

    @Scheduled(fixedDelay = 10000L)
    public void checkTimedOutSessions() {
        executionAsyncSessionService.failTimedOutLiveSteps();
    }
}
