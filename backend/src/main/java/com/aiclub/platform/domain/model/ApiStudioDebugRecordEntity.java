package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 个人调试记录。
 * 保存调试请求快照、响应快照、状态码、耗时和错误信息。
 * 敏感 Header 和变量值在入库前脱敏。
 * 调试记录只对创建人可见，不支持项目级共享。
 */
@Entity
@Table(name = "api_studio_debug_record")
public class ApiStudioDebugRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "endpoint_id")
    private Long endpointId;

    @Column(name = "environment_id")
    private Long environmentId;

    @Column(name = "creator_user_id", nullable = false)
    private Long creatorUserId;

    @Column(name = "request_snapshot_json", columnDefinition = "TEXT")
    private String requestSnapshotJson;

    @Column(name = "response_snapshot_json", columnDefinition = "TEXT")
    private String responseSnapshotJson;

    @Column(name = "status_code")
    private Integer statusCode;

    @Column(name = "duration_millis")
    private Long durationMillis;

    @Column(nullable = false)
    private Boolean success = false;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }

    public Long getEndpointId() { return endpointId; }
    public void setEndpointId(Long endpointId) { this.endpointId = endpointId; }

    public Long getEnvironmentId() { return environmentId; }
    public void setEnvironmentId(Long environmentId) { this.environmentId = environmentId; }

    public Long getCreatorUserId() { return creatorUserId; }
    public void setCreatorUserId(Long creatorUserId) { this.creatorUserId = creatorUserId; }

    public String getRequestSnapshotJson() { return requestSnapshotJson; }
    public void setRequestSnapshotJson(String requestSnapshotJson) { this.requestSnapshotJson = requestSnapshotJson; }

    public String getResponseSnapshotJson() { return responseSnapshotJson; }
    public void setResponseSnapshotJson(String responseSnapshotJson) { this.responseSnapshotJson = responseSnapshotJson; }

    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer statusCode) { this.statusCode = statusCode; }

    public Long getDurationMillis() { return durationMillis; }
    public void setDurationMillis(Long durationMillis) { this.durationMillis = durationMillis; }

    public Boolean getSuccess() { return success; }
    public void setSuccess(Boolean success) { this.success = success; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
