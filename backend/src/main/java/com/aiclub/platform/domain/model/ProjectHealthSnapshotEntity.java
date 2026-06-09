package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 项目健康检查时序快照。
 * 记录每次 HTTP/TCP 探针结果，供项目概览与趋势图复用。
 */
@Entity
@Table(name = "project_health_snapshot")
public class ProjectHealthSnapshotEntity {

    public static final String AVAILABILITY_UP = "UP";
    public static final String AVAILABILITY_DOWN = "DOWN";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属项目。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 快照所属运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "runtime_instance_id", nullable = false)
    private ProjectRuntimeInstanceEntity runtimeInstance;

    /**
     * 探针类型，例如 HTTP / TCP。
     */
    @Column(name = "probe_type", nullable = false, length = 20)
    private String probeType;

    /**
     * 本次探测的目标地址。
     */
    @Column(name = "probe_target", nullable = false, length = 500)
    private String probeTarget;

    /**
     * 可用性结果：UP / DOWN。
     */
    @Column(name = "availability_status", nullable = false, length = 30)
    private String availabilityStatus;

    /**
     * HTTP 探针的响应状态码；TCP 探针可为空。
     */
    @Column(name = "http_status")
    private Integer httpStatus;

    /**
     * 探测耗时，单位毫秒。
     */
    @Column(name = "latency_ms")
    private Long latencyMs;

    /**
     * 本次探测映射出的健康得分。
     */
    @Column(name = "health_score", nullable = false)
    private Integer healthScore;

    /**
     * 本次探测映射出的健康等级。
     */
    @Column(name = "health_level", nullable = false, length = 30)
    private String healthLevel;

    /**
     * 探测失败原因或摘要说明。
     */
    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    /**
     * 采样时间。
     */
    @Column(name = "sampled_at", nullable = false)
    private LocalDateTime sampledAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (sampledAt == null) {
            sampledAt = now;
        }
        if (createdAt == null) {
            createdAt = now;
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public ProjectRuntimeInstanceEntity getRuntimeInstance() {
        return runtimeInstance;
    }

    public void setRuntimeInstance(ProjectRuntimeInstanceEntity runtimeInstance) {
        this.runtimeInstance = runtimeInstance;
    }

    public String getProbeType() {
        return probeType;
    }

    public void setProbeType(String probeType) {
        this.probeType = probeType;
    }

    public String getProbeTarget() {
        return probeTarget;
    }

    public void setProbeTarget(String probeTarget) {
        this.probeTarget = probeTarget;
    }

    public String getAvailabilityStatus() {
        return availabilityStatus;
    }

    public void setAvailabilityStatus(String availabilityStatus) {
        this.availabilityStatus = availabilityStatus;
    }

    public Integer getHttpStatus() {
        return httpStatus;
    }

    public void setHttpStatus(Integer httpStatus) {
        this.httpStatus = httpStatus;
    }

    public Long getLatencyMs() {
        return latencyMs;
    }

    public void setLatencyMs(Long latencyMs) {
        this.latencyMs = latencyMs;
    }

    public Integer getHealthScore() {
        return healthScore;
    }

    public void setHealthScore(Integer healthScore) {
        this.healthScore = healthScore;
    }

    public String getHealthLevel() {
        return healthLevel;
    }

    public void setHealthLevel(String healthLevel) {
        this.healthLevel = healthLevel;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public LocalDateTime getSampledAt() {
        return sampledAt;
    }

    public void setSampledAt(LocalDateTime sampledAt) {
        this.sampledAt = sampledAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
