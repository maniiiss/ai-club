package com.aiclub.platform.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 周期性扫描索引状态落后的 Wiki 页面，补入 LightRAG 索引队列。
 * 业务意图：覆盖消费者宕机、事件丢失、增量失败等漏网情况，作为 outbox 队列的双保险。
 */
@Service
public class LightRagIndexScanScheduler {

    private static final Logger log = LoggerFactory.getLogger(LightRagIndexScanScheduler.class);
    private static final int DEFAULT_BATCH_SIZE = 50;

    private final LightRagIngestQueueService lightRagIngestQueueService;
    private final boolean schedulerEnabled;

    public LightRagIndexScanScheduler(LightRagIngestQueueService lightRagIngestQueueService,
                                      @Value("${platform.lightrag.ingest.scheduler-enabled:true}") boolean schedulerEnabled) {
        this.lightRagIngestQueueService = lightRagIngestQueueService;
        this.schedulerEnabled = schedulerEnabled;
    }

    @Scheduled(fixedDelayString = "${platform.lightrag.ingest.scan-interval-ms:600000}")
    public void scanStalePages() {
        if (!schedulerEnabled) {
            return;
        }
        try {
            int processed = lightRagIngestQueueService.scanStaleAndEnqueue(DEFAULT_BATCH_SIZE);
            if (processed > 0) {
                log.info("LightRAG 索引兜底扫描补入 {} 个页面", processed);
            }
        } catch (RuntimeException exception) {
            log.warn("LightRAG 索引兜底扫描失败：{}", exception.getMessage());
        }
    }
}
