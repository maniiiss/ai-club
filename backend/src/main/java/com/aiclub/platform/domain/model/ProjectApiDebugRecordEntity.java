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
 * 项目级 API 调试记录，沉淀最近请求快照与响应结果，方便团队复盘和复用。
 */
@Entity
@Table(name = "project_api_debug_record")
public class ProjectApiDebugRecordEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 归属项目。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private ProjectEntity project;

    /** 来源接口定义。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "endpoint_id")
    private ProjectApiEndpointEntity endpoint;

    /** 使用的项目环境。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "environment_id")
    private ProjectApiEnvironmentEntity environment;

    /** 请求快照 JSON。 */
    @Column(name = "request_snapshot_json", nullable = false, columnDefinition = "TEXT")
    private String requestSnapshotJson = "{}";

    /** 响应快照 JSON。 */
    @Column(name = "response_snapshot_json", nullable = false, columnDefinition = "TEXT")
    private String responseSnapshotJson = "{}";

    /** 请求耗时。 */
    @Column(name = "duration_millis", nullable = false)
    private Long durationMillis = 0L;

    /** 是否执行成功。 */
    @Column(nullable = false)
    private Boolean success = Boolean.FALSE;

    /** 错误摘要。 */
    @Column(name = "error_message", nullable = false, columnDefinition = "TEXT")
    private String errorMessage = "";

    /** 发起调试的用户。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creator_user_id")
    private UserEntity creatorUser;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
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

    public ProjectApiEndpointEntity getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(ProjectApiEndpointEntity endpoint) {
        this.endpoint = endpoint;
    }

    public ProjectApiEnvironmentEntity getEnvironment() {
        return environment;
    }

    public void setEnvironment(ProjectApiEnvironmentEntity environment) {
        this.environment = environment;
    }

    public String getRequestSnapshotJson() {
        return requestSnapshotJson;
    }

    public void setRequestSnapshotJson(String requestSnapshotJson) {
        this.requestSnapshotJson = requestSnapshotJson;
    }

    public String getResponseSnapshotJson() {
        return responseSnapshotJson;
    }

    public void setResponseSnapshotJson(String responseSnapshotJson) {
        this.responseSnapshotJson = responseSnapshotJson;
    }

    public Long getDurationMillis() {
        return durationMillis;
    }

    public void setDurationMillis(Long durationMillis) {
        this.durationMillis = durationMillis;
    }

    public Boolean getSuccess() {
        return success;
    }

    public void setSuccess(Boolean success) {
        this.success = success;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public UserEntity getCreatorUser() {
        return creatorUser;
    }

    public void setCreatorUser(UserEntity creatorUser) {
        this.creatorUser = creatorUser;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
