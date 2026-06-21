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
 * 模型对比测试整体记录。
 * 一次 run 对应一次"批量并发压测"，包含若干模型，每个模型的指标聚合到 ai_model_benchmark_metric。
 */
@Entity
@Table(name = "ai_model_benchmark_run")
public class ModelBenchmarkRunEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 关联的配置 id。一份配置可被多次触发运行，每条 run 都挂在唯一一份 config 下。
     * 字段以下的 name/concurrency/... 都是触发瞬间从 config 拷贝的"运行时快照"，
     * 编辑 config 不会修改历史 run 的快照。
     */
    @Column(name = "config_id", nullable = false)
    private Long configId;

    @Column(nullable = false, length = 160)
    private String name;

    /** PENDING / RUNNING / SUCCESS / FAILED / CANCELED */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @Column(nullable = false)
    private Integer concurrency;

    @Column(name = "total_requests", nullable = false)
    private Integer totalRequests;

    @Column(name = "stream_enabled", nullable = false)
    private Boolean streamEnabled = Boolean.TRUE;

    @Column(name = "max_tokens", nullable = false)
    private Integer maxTokens = 512;

    @Column(name = "system_prompt", nullable = false, columnDefinition = "TEXT")
    private String systemPrompt = "";

    @Column(name = "user_prompt", nullable = false, columnDefinition = "TEXT")
    private String userPrompt = "";

    /** JSON 数组字符串，存放参与对比的 ai_model_config.id（保留下达时的顺序）。 */
    @Column(name = "model_ids", nullable = false, columnDefinition = "TEXT")
    private String modelIds = "[]";

    @Column(name = "progress_total", nullable = false)
    private Integer progressTotal = 0;

    @Column(name = "progress_done", nullable = false)
    private Integer progressDone = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

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

    public Long getConfigId() { return configId; }
    public void setConfigId(Long configId) { this.configId = configId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getConcurrency() { return concurrency; }
    public void setConcurrency(Integer concurrency) { this.concurrency = concurrency; }

    public Integer getTotalRequests() { return totalRequests; }
    public void setTotalRequests(Integer totalRequests) { this.totalRequests = totalRequests; }

    public Boolean getStreamEnabled() { return streamEnabled; }
    public void setStreamEnabled(Boolean streamEnabled) { this.streamEnabled = streamEnabled; }

    public Integer getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Integer maxTokens) { this.maxTokens = maxTokens; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    public String getUserPrompt() { return userPrompt; }
    public void setUserPrompt(String userPrompt) { this.userPrompt = userPrompt; }

    public String getModelIds() { return modelIds; }
    public void setModelIds(String modelIds) { this.modelIds = modelIds; }

    public Integer getProgressTotal() { return progressTotal; }
    public void setProgressTotal(Integer progressTotal) { this.progressTotal = progressTotal; }

    public Integer getProgressDone() { return progressDone; }
    public void setProgressDone(Integer progressDone) { this.progressDone = progressDone; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public LocalDateTime getFinishedAt() { return finishedAt; }
    public void setFinishedAt(LocalDateTime finishedAt) { this.finishedAt = finishedAt; }
}
