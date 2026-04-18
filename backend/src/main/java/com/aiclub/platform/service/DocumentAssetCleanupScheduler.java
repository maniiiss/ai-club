package com.aiclub.platform.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 文档资产临时文件清理调度器。
 * 第一版先扫描过期资产，后续可扩展为真正删除对象存储中的原文件。
 */
@Service
public class DocumentAssetCleanupScheduler {

    private final DocumentAssetService documentAssetService;

    public DocumentAssetCleanupScheduler(DocumentAssetService documentAssetService) {
        this.documentAssetService = documentAssetService;
    }

    /**
     * 周期性扫描临时文档资产。
     * 当前第一版先完成仓储与调度打通，后续再补对象删除实现。
     */
    @Scheduled(fixedDelay = 3600000L)
    public void cleanupExpiredTempAssets() {
        documentAssetService.findExpiredTempAssets();
    }
}
