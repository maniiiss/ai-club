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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 项目运行实例，沉淀项目部署后的可观测采集目标，避免日志和健康检查从流水线参数中临时推断。
 */
@Entity
@Table(name = "project_runtime_instance")
public class ProjectRuntimeInstanceEntity {

    public static final String SOURCE_TYPE_MANUAL = "MANUAL";
    public static final String SOURCE_TYPE_JENKINS = "JENKINS";
    public static final String SOURCE_TYPE_WOODPECKER = "WOODPECKER";

    public static final String SERVER_MODE_MANAGED_SERVER = "MANAGED_SERVER";
    public static final String SERVER_MODE_EXTERNAL_ENDPOINT = "EXTERNAL_ENDPOINT";

    public static final String HEALTH_PROBE_HTTP = "HTTP";
    public static final String HEALTH_PROBE_TCP = "TCP";

    public static final String STATUS_DEPLOYING = "DEPLOYING";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 运行实例所属平台项目，后续日志和健康查询均按项目权限收口。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 实例来源：手工维护或 Jenkins 绑定同步。
     */
    @Column(name = "source_type", nullable = false, length = 30)
    private String sourceType = SOURCE_TYPE_MANUAL;

    /**
     * 来源业务 ID，例如 Jenkins 流水线绑定 ID；手工实例为空。
     */
    @Column(name = "source_binding_id")
    private Long sourceBindingId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 60)
    private String environment;

    @Column(name = "service_name", length = 120)
    private String serviceName;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "server_mode", nullable = false, length = 30)
    private String serverMode = SERVER_MODE_MANAGED_SERVER;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "server_id")
    private ServerInfoEntity server;

    @Column(name = "external_base_url", length = 500)
    private String externalBaseUrl;

    @Column(name = "log_enabled", nullable = false)
    private Boolean logEnabled = Boolean.FALSE;

    @Column(name = "log_paths_json", nullable = false, columnDefinition = "TEXT")
    private String logPathsJson = "[]";

    @Column(name = "health_enabled", nullable = false)
    private Boolean healthEnabled = Boolean.TRUE;

    @Column(name = "health_probe_type", length = 20)
    private String healthProbeType = HEALTH_PROBE_HTTP;

    @Column(name = "health_target", length = 500)
    private String healthTarget;

    @Column(name = "last_deployed_at")
    private LocalDateTime lastDeployedAt;

    @Column(name = "last_status", length = 30)
    private String lastStatus;

    @Column(name = "last_status_message", length = 500)
    private String lastStatusMessage;

    /**
     * 最近一次日志采集完成时间。
     */
    @Column(name = "last_log_collected_at")
    private LocalDateTime lastLogCollectedAt;

    /**
     * 最近一次日志采集状态，例如 SUCCESS / FAILED / SKIPPED。
     */
    @Column(name = "last_log_collect_status", length = 30)
    private String lastLogCollectStatus;

    /**
     * 最近一次日志采集结果说明，供可观测性中心直接展示。
     */
    @Column(name = "last_log_collect_message", length = 500)
    private String lastLogCollectMessage;

    /**
     * 最近一次健康检查时间。
     */
    @Column(name = "last_health_checked_at")
    private LocalDateTime lastHealthCheckedAt;

    /**
     * 最近一次健康检查得分。
     */
    @Column(name = "last_health_score")
    private Integer lastHealthScore;

    /**
     * 最近一次健康等级，例如 HEALTHY / DEGRADED / ABNORMAL。
     */
    @Column(name = "last_health_level", length = 30)
    private String lastHealthLevel;

    /**
     * 最近一次健康检查说明。
     */
    @Column(name = "last_health_message", length = 500)
    private String lastHealthMessage;

    /**
     * 最近一次健康检查耗时，单位毫秒。
     */
    @Column(name = "last_health_latency_ms")
    private Long lastHealthLatencyMs;

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

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public Long getSourceBindingId() {
        return sourceBindingId;
    }

    public void setSourceBindingId(Long sourceBindingId) {
        this.sourceBindingId = sourceBindingId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getServiceName() {
        return serviceName;
    }

    public void setServiceName(String serviceName) {
        this.serviceName = serviceName;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getServerMode() {
        return serverMode;
    }

    public void setServerMode(String serverMode) {
        this.serverMode = serverMode;
    }

    public ServerInfoEntity getServer() {
        return server;
    }

    public void setServer(ServerInfoEntity server) {
        this.server = server;
    }

    public String getExternalBaseUrl() {
        return externalBaseUrl;
    }

    public void setExternalBaseUrl(String externalBaseUrl) {
        this.externalBaseUrl = externalBaseUrl;
    }

    public Boolean getLogEnabled() {
        return logEnabled;
    }

    public void setLogEnabled(Boolean logEnabled) {
        this.logEnabled = logEnabled;
    }

    public String getLogPathsJson() {
        return logPathsJson;
    }

    public void setLogPathsJson(String logPathsJson) {
        this.logPathsJson = logPathsJson;
    }

    public Boolean getHealthEnabled() {
        return healthEnabled;
    }

    public void setHealthEnabled(Boolean healthEnabled) {
        this.healthEnabled = healthEnabled;
    }

    public String getHealthProbeType() {
        return healthProbeType;
    }

    public void setHealthProbeType(String healthProbeType) {
        this.healthProbeType = healthProbeType;
    }

    public String getHealthTarget() {
        return healthTarget;
    }

    public void setHealthTarget(String healthTarget) {
        this.healthTarget = healthTarget;
    }

    public LocalDateTime getLastDeployedAt() {
        return lastDeployedAt;
    }

    public void setLastDeployedAt(LocalDateTime lastDeployedAt) {
        this.lastDeployedAt = lastDeployedAt;
    }

    public String getLastStatus() {
        return lastStatus;
    }

    public void setLastStatus(String lastStatus) {
        this.lastStatus = lastStatus;
    }

    public String getLastStatusMessage() {
        return lastStatusMessage;
    }

    public void setLastStatusMessage(String lastStatusMessage) {
        this.lastStatusMessage = lastStatusMessage;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public LocalDateTime getLastLogCollectedAt() {
        return lastLogCollectedAt;
    }

    public void setLastLogCollectedAt(LocalDateTime lastLogCollectedAt) {
        this.lastLogCollectedAt = lastLogCollectedAt;
    }

    public String getLastLogCollectStatus() {
        return lastLogCollectStatus;
    }

    public void setLastLogCollectStatus(String lastLogCollectStatus) {
        this.lastLogCollectStatus = lastLogCollectStatus;
    }

    public String getLastLogCollectMessage() {
        return lastLogCollectMessage;
    }

    public void setLastLogCollectMessage(String lastLogCollectMessage) {
        this.lastLogCollectMessage = lastLogCollectMessage;
    }

    public LocalDateTime getLastHealthCheckedAt() {
        return lastHealthCheckedAt;
    }

    public void setLastHealthCheckedAt(LocalDateTime lastHealthCheckedAt) {
        this.lastHealthCheckedAt = lastHealthCheckedAt;
    }

    public Integer getLastHealthScore() {
        return lastHealthScore;
    }

    public void setLastHealthScore(Integer lastHealthScore) {
        this.lastHealthScore = lastHealthScore;
    }

    public String getLastHealthLevel() {
        return lastHealthLevel;
    }

    public void setLastHealthLevel(String lastHealthLevel) {
        this.lastHealthLevel = lastHealthLevel;
    }

    public String getLastHealthMessage() {
        return lastHealthMessage;
    }

    public void setLastHealthMessage(String lastHealthMessage) {
        this.lastHealthMessage = lastHealthMessage;
    }

    public Long getLastHealthLatencyMs() {
        return lastHealthLatencyMs;
    }

    public void setLastHealthLatencyMs(Long lastHealthLatencyMs) {
        this.lastHealthLatencyMs = lastHealthLatencyMs;
    }
}
