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
 * 服务器资源采样快照。
 * 列表页只展示最新摘要，详情页短趋势和告警评估则复用该表中的历史样本。
 */
@Entity
@Table(name = "server_metric_sample")
public class ServerMetricSampleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "server_id", nullable = false)
    private ServerInfoEntity server;

    @Column(name = "probe_status", nullable = false, length = 30)
    private String probeStatus;

    @Column(name = "probe_message", length = 500)
    private String probeMessage;

    @Column(name = "cpu_usage_percent")
    private Integer cpuUsagePercent;

    @Column(name = "memory_usage_percent")
    private Integer memoryUsagePercent;

    @Column(name = "disk_usage_percent")
    private Integer diskUsagePercent;

    @Column(name = "sampled_at", nullable = false)
    private LocalDateTime sampledAt;

    @PrePersist
    public void onCreate() {
        if (this.sampledAt == null) {
            this.sampledAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ServerInfoEntity getServer() {
        return server;
    }

    public void setServer(ServerInfoEntity server) {
        this.server = server;
    }

    public String getProbeStatus() {
        return probeStatus;
    }

    public void setProbeStatus(String probeStatus) {
        this.probeStatus = probeStatus;
    }

    public String getProbeMessage() {
        return probeMessage;
    }

    public void setProbeMessage(String probeMessage) {
        this.probeMessage = probeMessage;
    }

    public Integer getCpuUsagePercent() {
        return cpuUsagePercent;
    }

    public void setCpuUsagePercent(Integer cpuUsagePercent) {
        this.cpuUsagePercent = cpuUsagePercent;
    }

    public Integer getMemoryUsagePercent() {
        return memoryUsagePercent;
    }

    public void setMemoryUsagePercent(Integer memoryUsagePercent) {
        this.memoryUsagePercent = memoryUsagePercent;
    }

    public Integer getDiskUsagePercent() {
        return diskUsagePercent;
    }

    public void setDiskUsagePercent(Integer diskUsagePercent) {
        this.diskUsagePercent = diskUsagePercent;
    }

    public LocalDateTime getSampledAt() {
        return sampledAt;
    }

    public void setSampledAt(LocalDateTime sampledAt) {
        this.sampledAt = sampledAt;
    }
}
