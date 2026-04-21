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
@Table(name = "project_gitlab_binding")
public class ProjectGitlabBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 业务项目，允许一个项目同时关联多个 GitLab 仓库。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @Column(name = "api_base_url", nullable = false, length = 255)
    private String apiBaseUrl;

    @Column(name = "gitlab_project_ref", nullable = false, length = 255)
    private String gitlabProjectRef;

    @Column(name = "gitlab_project_id", length = 100)
    private String gitlabProjectId;

    @Column(name = "gitlab_project_name", length = 200)
    private String gitlabProjectName;

    @Column(name = "gitlab_project_path", length = 255)
    private String gitlabProjectPath;

    @Column(name = "gitlab_project_web_url", length = 255)
    private String gitlabProjectWebUrl;

    /**
     * GitLab 提供的 HTTP Clone 地址，供平台扫描任务直接 clone 仓库使用。
     */
    @Column(name = "gitlab_http_clone_url", length = 500)
    private String gitlabHttpCloneUrl;

    /**
     * GitLab 提供的 SSH Clone 地址，当前首版主要用于展示和后续扩展。
     */
    @Column(name = "gitlab_ssh_clone_url", length = 500)
    private String gitlabSshCloneUrl;

    @Column(name = "default_target_branch", length = 100)
    private String defaultTargetBranch;

    /**
     * 项目级测试模板配置。
     * 首版直接保存 JSON 文本，避免仓库绑定表单与执行侧模型发生强耦合。
     */
    @Column(name = "test_profile_json", columnDefinition = "TEXT")
    private String testProfileJson;

    @Column(name = "token_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String tokenCiphertext;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "last_test_status", length = 30)
    private String lastTestStatus;

    @Column(name = "last_test_message", length = 500)
    private String lastTestMessage;

    @Column(name = "last_tested_at")
    private LocalDateTime lastTestedAt;

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

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public void setApiBaseUrl(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }

    public String getGitlabProjectRef() {
        return gitlabProjectRef;
    }

    public void setGitlabProjectRef(String gitlabProjectRef) {
        this.gitlabProjectRef = gitlabProjectRef;
    }

    public String getGitlabProjectId() {
        return gitlabProjectId;
    }

    public void setGitlabProjectId(String gitlabProjectId) {
        this.gitlabProjectId = gitlabProjectId;
    }

    public String getGitlabProjectName() {
        return gitlabProjectName;
    }

    public void setGitlabProjectName(String gitlabProjectName) {
        this.gitlabProjectName = gitlabProjectName;
    }

    public String getGitlabProjectPath() {
        return gitlabProjectPath;
    }

    public void setGitlabProjectPath(String gitlabProjectPath) {
        this.gitlabProjectPath = gitlabProjectPath;
    }

    public String getGitlabProjectWebUrl() {
        return gitlabProjectWebUrl;
    }

    public void setGitlabProjectWebUrl(String gitlabProjectWebUrl) {
        this.gitlabProjectWebUrl = gitlabProjectWebUrl;
    }

    public String getDefaultTargetBranch() {
        return defaultTargetBranch;
    }

    public String getGitlabHttpCloneUrl() {
        return gitlabHttpCloneUrl;
    }

    public void setGitlabHttpCloneUrl(String gitlabHttpCloneUrl) {
        this.gitlabHttpCloneUrl = gitlabHttpCloneUrl;
    }

    public String getGitlabSshCloneUrl() {
        return gitlabSshCloneUrl;
    }

    public void setGitlabSshCloneUrl(String gitlabSshCloneUrl) {
        this.gitlabSshCloneUrl = gitlabSshCloneUrl;
    }

    public void setDefaultTargetBranch(String defaultTargetBranch) {
        this.defaultTargetBranch = defaultTargetBranch;
    }

    public String getTestProfileJson() {
        return testProfileJson;
    }

    public void setTestProfileJson(String testProfileJson) {
        this.testProfileJson = testProfileJson;
    }

    public String getTokenCiphertext() {
        return tokenCiphertext;
    }

    public void setTokenCiphertext(String tokenCiphertext) {
        this.tokenCiphertext = tokenCiphertext;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getLastTestStatus() {
        return lastTestStatus;
    }

    public void setLastTestStatus(String lastTestStatus) {
        this.lastTestStatus = lastTestStatus;
    }

    public String getLastTestMessage() {
        return lastTestMessage;
    }

    public void setLastTestMessage(String lastTestMessage) {
        this.lastTestMessage = lastTestMessage;
    }

    public LocalDateTime getLastTestedAt() {
        return lastTestedAt;
    }

    public void setLastTestedAt(LocalDateTime lastTestedAt) {
        this.lastTestedAt = lastTestedAt;
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
