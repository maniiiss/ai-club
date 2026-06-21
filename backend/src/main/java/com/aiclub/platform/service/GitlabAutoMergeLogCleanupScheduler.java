package com.aiclub.platform.service;

import com.aiclub.platform.repository.GitlabAutoMergeLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 定期清理过期的自动合并日志，避免 gitlab_auto_merge_log 表无限增长。
 * 保留天数由 platform.auto-merge.log.retention-days 控制，默认 5 天。
 */
@Service
public class GitlabAutoMergeLogCleanupScheduler {

    private static final Logger log = LoggerFactory.getLogger(GitlabAutoMergeLogCleanupScheduler.class);

    private final GitlabAutoMergeLogRepository autoMergeLogRepository;
    private final int retentionDays;

    public GitlabAutoMergeLogCleanupScheduler(
            GitlabAutoMergeLogRepository autoMergeLogRepository,
            @Value("${platform.auto-merge.log.retention-days:5}") int retentionDays) {
        this.autoMergeLogRepository = autoMergeLogRepository;
        this.retentionDays = Math.max(1, retentionDays);
    }

    /**
     * 按固定间隔执行清理，默认每小时执行一次。
     */
    @Transactional
    @Scheduled(fixedDelayString = "${platform.auto-merge.log.cleanup-interval-ms:3600000}")
    public void cleanupExpiredLogs() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        long deleted = autoMergeLogRepository.deleteAllByExecutedAtBefore(cutoff);
        if (deleted > 0) {
            log.info("已清理 {} 条过期自动合并日志（保留 {} 天，截止时间 {}）", deleted, retentionDays, cutoff);
        }
    }
}
