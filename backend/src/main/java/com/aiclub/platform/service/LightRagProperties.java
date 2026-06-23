package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * LightRAG 统一知识图谱底层配置。
 * 业务意图：替代原 WikiKnowledgeSearchService + KnowledgeGraphService 两套中间产物，
 * 用 LightRAG 单路径管理 Wiki/PRD 的实体关系抽取、检索与可视化。
 * 切流开关（hermes-evidence-enabled / graph-enabled）默认关闭，走旧链路，保证灰度可回滚。
 */
@Component
public class LightRagProperties {

    private final boolean enabled;
    private final boolean hermesEvidenceEnabled;
    private final boolean graphEnabled;
    private final int queryTopK;
    private final String queryDefaultMode;
    private final int graphNodeLimit;
    private final int ingestRetryMax;
    private long ingestScanIntervalMs;

    public LightRagProperties(
            @Value("${platform.lightrag.enabled:true}") boolean enabled,
            @Value("${platform.lightrag.hermes-evidence-enabled:false}") boolean hermesEvidenceEnabled,
            @Value("${platform.lightrag.graph-enabled:false}") boolean graphEnabled,
            @Value("${platform.lightrag.query.top-k:3}") int queryTopK,
            @Value("${platform.lightrag.query.default-mode:local}") String queryDefaultMode,
            @Value("${platform.lightrag.graph-node-limit:500}") int graphNodeLimit,
            @Value("${platform.lightrag.ingest.retry-max:5}") int ingestRetryMax,
            @Value("${platform.lightrag.ingest.scan-interval-ms:600000}") long ingestScanIntervalMs) {
        this.enabled = enabled;
        this.hermesEvidenceEnabled = hermesEvidenceEnabled;
        this.graphEnabled = graphEnabled;
        this.queryTopK = Math.max(1, Math.min(queryTopK, 20));
        this.queryDefaultMode = defaultMode(queryDefaultMode);
        this.graphNodeLimit = Math.max(10, Math.min(graphNodeLimit, 5000));
        this.ingestRetryMax = Math.max(1, Math.min(ingestRetryMax, 20));
        this.ingestScanIntervalMs = Math.max(60000L, ingestScanIntervalMs);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isHermesEvidenceEnabled() {
        return enabled && hermesEvidenceEnabled;
    }

    public boolean isGraphEnabled() {
        return enabled && graphEnabled;
    }

    public int getQueryTopK() {
        return queryTopK;
    }

    public String getQueryDefaultMode() {
        return queryDefaultMode;
    }

    public int getGraphNodeLimit() {
        return graphNodeLimit;
    }

    public int getIngestRetryMax() {
        return ingestRetryMax;
    }

    public long getIngestScanIntervalMs() {
        return ingestScanIntervalMs;
    }

    private String defaultMode(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase();
        return switch (normalized) {
            case "local", "global", "hybrid", "naive", "mix" -> normalized;
            default -> "local";
        };
    }
}
