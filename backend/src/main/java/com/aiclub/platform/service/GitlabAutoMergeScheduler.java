package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

@Component
public class GitlabAutoMergeScheduler {

    private final GitlabManagementService gitlabManagementService;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public GitlabAutoMergeScheduler(GitlabManagementService gitlabManagementService) {
        this.gitlabManagementService = gitlabManagementService;
    }

    @Scheduled(cron = "* * * * * *")
    public void execute() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            gitlabManagementService.runEnabledAutoMergeConfigs();
        } finally {
            running.set(false);
        }
    }
}
