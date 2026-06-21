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
 * 模型对比测试配置：可重复编辑、可重复触发的"测试方案"。
 *
 * <p>每次触发运行会基于本配置当前字段生成一条 ai_model_benchmark_run，
 * run 自身保留所有配置字段作为"运行时快照"，因此对 config 的后续编辑
 * 不会污染历史 run 的指标可追溯性。</p>
 */
@Entity
@Table(name = "ai_model_benchmark_config")
public class ModelBenchmarkConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String name;

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

    /** JSON 数组字符串，存放 ai_model_config.id（保留下达时的顺序）。 */
    @Column(name = "model_ids", nullable = false, columnDefinition = "TEXT")
    private String modelIds = "[]";

    @Column(name = "created_by")
    private Long createdBy;

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

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

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

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
