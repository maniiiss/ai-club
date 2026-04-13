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

@Entity
@Table(name = "project_pipeline_binding")
public class ProjectPipelineBindingEntity {

    /**
     * 流水线绑定主键。
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 关联的业务项目，允许一个项目绑定多条 Jenkins 流水线。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 关联的 Jenkins 服务。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "jenkins_server_id", nullable = false)
    private JenkinsServerEntity jenkinsServer;

    /**
     * Jenkins Job 名称。
     */
    @Column(name = "job_name", nullable = false, length = 255)
    private String jobName;

    /**
     * Jenkins Job 页面地址。
     */
    @Column(name = "job_url", length = 500)
    private String jobUrl;

    /**
     * 默认构建分支。
     */
    @Column(name = "default_branch", length = 100)
    private String defaultBranch;

    /**
     * 构建参数 JSON。
     */
    @Column(name = "build_parameters_json", columnDefinition = "TEXT")
    private String buildParametersJson;

    /**
     * 当前绑定是否启用。
     */
    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /**
     * 最近一次触发状态。
     */
    @Column(name = "last_trigger_status", length = 30)
    private String lastTriggerStatus;

    /**
     * 最近一次触发说明。
     */
    @Column(name = "last_trigger_message", length = 500)
    private String lastTriggerMessage;

    /**
     * 最近一次触发时间。
     */
    @Column(name = "last_triggered_at")
    private LocalDateTime lastTriggeredAt;

    /**
     * 最近一次触发跳转链接。
     */
    @Column(name = "last_trigger_url", length = 500)
    private String lastTriggerUrl;

    /**
     * 创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 更新时间。
     */
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

    public JenkinsServerEntity getJenkinsServer() {
        return jenkinsServer;
    }

    public void setJenkinsServer(JenkinsServerEntity jenkinsServer) {
        this.jenkinsServer = jenkinsServer;
    }

    public String getJobName() {
        return jobName;
    }

    public void setJobName(String jobName) {
        this.jobName = jobName;
    }

    public String getJobUrl() {
        return jobUrl;
    }

    public void setJobUrl(String jobUrl) {
        this.jobUrl = jobUrl;
    }

    public String getDefaultBranch() {
        return defaultBranch;
    }

    public void setDefaultBranch(String defaultBranch) {
        this.defaultBranch = defaultBranch;
    }

    public String getBuildParametersJson() {
        return buildParametersJson;
    }

    public void setBuildParametersJson(String buildParametersJson) {
        this.buildParametersJson = buildParametersJson;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getLastTriggerStatus() {
        return lastTriggerStatus;
    }

    public void setLastTriggerStatus(String lastTriggerStatus) {
        this.lastTriggerStatus = lastTriggerStatus;
    }

    public String getLastTriggerMessage() {
        return lastTriggerMessage;
    }

    public void setLastTriggerMessage(String lastTriggerMessage) {
        this.lastTriggerMessage = lastTriggerMessage;
    }

    public LocalDateTime getLastTriggeredAt() {
        return lastTriggeredAt;
    }

    public void setLastTriggeredAt(LocalDateTime lastTriggeredAt) {
        this.lastTriggeredAt = lastTriggeredAt;
    }

    public String getLastTriggerUrl() {
        return lastTriggerUrl;
    }

    public void setLastTriggerUrl(String lastTriggerUrl) {
        this.lastTriggerUrl = lastTriggerUrl;
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
}
