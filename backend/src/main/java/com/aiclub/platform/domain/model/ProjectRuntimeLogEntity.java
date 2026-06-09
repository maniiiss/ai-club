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
 * 项目运行日志明细。
 * 统一承载 SSH 拉取与主动上报两种来源的应用日志，供项目级检索与排障复盘使用。
 */
@Entity
@Table(name = "project_runtime_log")
public class ProjectRuntimeLogEntity {

    public static final String SOURCE_TYPE_SSH = "SSH";
    public static final String SOURCE_TYPE_PUSH = "PUSH";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属项目，用于项目维度权限与检索收口。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 日志所属运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "runtime_instance_id", nullable = false)
    private ProjectRuntimeInstanceEntity runtimeInstance;

    /**
     * 产生日志的受管服务器；外部地址实例允许为空。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "server_id")
    private ServerInfoEntity server;

    /**
     * 日志来源类型：SSH 增量拉取或内部主动上报。
     */
    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType = SOURCE_TYPE_SSH;

    /**
     * 来源文件路径；主动上报场景可为空。
     */
    @Column(name = "source_path", length = 500)
    private String sourcePath;

    /**
     * 日志级别，例如 INFO / WARN / ERROR。
     */
    @Column(name = "log_level", length = 20)
    private String logLevel;

    /**
     * 日志 logger 名称。
     */
    @Column(length = 255)
    private String logger;

    /**
     * 链路追踪 ID。
     */
    @Column(name = "trace_id", length = 120)
    private String traceId;

    /**
     * 结构化后的主消息文本。
     */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String message = "";

    /**
     * 原始日志行，便于前端切换查看原文。
     */
    @Column(columnDefinition = "TEXT")
    private String raw;

    /**
     * 日志产生时间；解析失败时回退为采集时间。
     */
    @Column(name = "logged_at", nullable = false)
    private LocalDateTime loggedAt;

    /**
     * 平台采集或接收入库时间。
     */
    @Column(name = "collected_at", nullable = false)
    private LocalDateTime collectedAt;

    @PrePersist
    public void onCreate() {
        if (collectedAt == null) {
            collectedAt = LocalDateTime.now();
        }
        if (loggedAt == null) {
            loggedAt = collectedAt;
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

    public ServerInfoEntity getServer() {
        return server;
    }

    public void setServer(ServerInfoEntity server) {
        this.server = server;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getSourcePath() {
        return sourcePath;
    }

    public void setSourcePath(String sourcePath) {
        this.sourcePath = sourcePath;
    }

    public String getLogLevel() {
        return logLevel;
    }

    public void setLogLevel(String logLevel) {
        this.logLevel = logLevel;
    }

    public String getLogger() {
        return logger;
    }

    public void setLogger(String logger) {
        this.logger = logger;
    }

    public String getTraceId() {
        return traceId;
    }

    public void setTraceId(String traceId) {
        this.traceId = traceId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getRaw() {
        return raw;
    }

    public void setRaw(String raw) {
        this.raw = raw;
    }

    public LocalDateTime getLoggedAt() {
        return loggedAt;
    }

    public void setLoggedAt(LocalDateTime loggedAt) {
        this.loggedAt = loggedAt;
    }

    public LocalDateTime getCollectedAt() {
        return collectedAt;
    }

    public void setCollectedAt(LocalDateTime collectedAt) {
        this.collectedAt = collectedAt;
    }
}
