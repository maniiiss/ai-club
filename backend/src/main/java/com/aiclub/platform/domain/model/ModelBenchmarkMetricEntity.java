package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 模型对比测试中单个模型的聚合指标。
 * 字段尽量保留 snapshot（model_name / provider / model_real_name），
 * 便于即使原始模型配置被删除/改名后，历史 run 仍然可读。
 */
@Entity
@Table(name = "ai_model_benchmark_metric")
public class ModelBenchmarkMetricEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_id", nullable = false)
    private Long runId;

    @Column(name = "model_id", nullable = false)
    private Long modelId;

    @Column(name = "model_name", nullable = false, length = 160)
    private String modelName;

    @Column(nullable = false, length = 40)
    private String provider = "";

    @Column(name = "model_real_name", nullable = false, length = 160)
    private String modelRealName = "";

    @Column(name = "total_count", nullable = false)
    private Integer totalCount = 0;

    @Column(name = "success_count", nullable = false)
    private Integer successCount = 0;

    @Column(name = "failure_count", nullable = false)
    private Integer failureCount = 0;

    @Column(name = "failure_rate", nullable = false)
    private Double failureRate = 0.0;

    @Column(name = "avg_output_tokens", nullable = false)
    private Double avgOutputTokens = 0.0;

    @Column(name = "avg_ttft_ms", nullable = false)
    private Double avgTtftMs = 0.0;

    @Column(name = "avg_latency_ms", nullable = false)
    private Double avgLatencyMs = 0.0;

    @Column(name = "p50_latency_ms", nullable = false)
    private Double p50LatencyMs = 0.0;

    @Column(name = "p95_latency_ms", nullable = false)
    private Double p95LatencyMs = 0.0;

    @Column(name = "total_token_per_sec", nullable = false)
    private Double totalTokenPerSec = 0.0;

    @Column(name = "gen_token_per_sec", nullable = false)
    private Double genTokenPerSec = 0.0;

    @Column(nullable = false)
    private Double throughput = 0.0;

    @Column(name = "wall_time_ms", nullable = false)
    private Long wallTimeMs = 0L;

    /** true 表示 outputTokens 是按 text 长度估算（接口未返回 usage）。 */
    @Column(name = "token_estimated", nullable = false)
    private Boolean tokenEstimated = Boolean.FALSE;

    @Column(name = "sample_error", columnDefinition = "TEXT")
    private String sampleError;

    /** PENDING / RUNNING / SUCCESS / FAILED / SKIPPED */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getRunId() { return runId; }
    public void setRunId(Long runId) { this.runId = runId; }

    public Long getModelId() { return modelId; }
    public void setModelId(Long modelId) { this.modelId = modelId; }

    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getModelRealName() { return modelRealName; }
    public void setModelRealName(String modelRealName) { this.modelRealName = modelRealName; }

    public Integer getTotalCount() { return totalCount; }
    public void setTotalCount(Integer totalCount) { this.totalCount = totalCount; }

    public Integer getSuccessCount() { return successCount; }
    public void setSuccessCount(Integer successCount) { this.successCount = successCount; }

    public Integer getFailureCount() { return failureCount; }
    public void setFailureCount(Integer failureCount) { this.failureCount = failureCount; }

    public Double getFailureRate() { return failureRate; }
    public void setFailureRate(Double failureRate) { this.failureRate = failureRate; }

    public Double getAvgOutputTokens() { return avgOutputTokens; }
    public void setAvgOutputTokens(Double avgOutputTokens) { this.avgOutputTokens = avgOutputTokens; }

    public Double getAvgTtftMs() { return avgTtftMs; }
    public void setAvgTtftMs(Double avgTtftMs) { this.avgTtftMs = avgTtftMs; }

    public Double getAvgLatencyMs() { return avgLatencyMs; }
    public void setAvgLatencyMs(Double avgLatencyMs) { this.avgLatencyMs = avgLatencyMs; }

    public Double getP50LatencyMs() { return p50LatencyMs; }
    public void setP50LatencyMs(Double p50LatencyMs) { this.p50LatencyMs = p50LatencyMs; }

    public Double getP95LatencyMs() { return p95LatencyMs; }
    public void setP95LatencyMs(Double p95LatencyMs) { this.p95LatencyMs = p95LatencyMs; }

    public Double getTotalTokenPerSec() { return totalTokenPerSec; }
    public void setTotalTokenPerSec(Double totalTokenPerSec) { this.totalTokenPerSec = totalTokenPerSec; }

    public Double getGenTokenPerSec() { return genTokenPerSec; }
    public void setGenTokenPerSec(Double genTokenPerSec) { this.genTokenPerSec = genTokenPerSec; }

    public Double getThroughput() { return throughput; }
    public void setThroughput(Double throughput) { this.throughput = throughput; }

    public Long getWallTimeMs() { return wallTimeMs; }
    public void setWallTimeMs(Long wallTimeMs) { this.wallTimeMs = wallTimeMs; }

    public Boolean getTokenEstimated() { return tokenEstimated; }
    public void setTokenEstimated(Boolean tokenEstimated) { this.tokenEstimated = tokenEstimated; }

    public String getSampleError() { return sampleError; }
    public void setSampleError(String sampleError) { this.sampleError = sampleError; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
