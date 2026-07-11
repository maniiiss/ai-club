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
 * 业主代码仓库绑定。
 * 记录某个项目需要交付到的业主方 GitLab 仓库（其他 GitLab 实例）的访问信息，
 * 凭据按项目独立配置，Token 经 AES-GCM 加密后存储。
 * 配合 {@link OwnerRepoPushLogEntity} 记录每次推送的执行结果。
 */
@Entity
@Table(name = "project_owner_repo_binding")
public class ProjectOwnerRepoBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属业务项目，一个项目可配置多个业主仓库绑定。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 绑定名称，用于在列表与推送表单中区分多个业主仓库（如"XX业主交付仓"）。
     */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "api_base_url", nullable = false, length = 255)
    private String apiBaseUrl;

    /**
     * 业主仓库标识，支持 namespace/name 或数字 ID。
     */
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
     * 业主仓库 HTTP Clone 地址，由 code-processing 执行 git push 时使用。
     */
    @Column(name = "gitlab_http_clone_url", length = 500)
    private String gitlabHttpCloneUrl;

    @Column(name = "gitlab_ssh_clone_url", length = 500)
    private String gitlabSshCloneUrl;

    /**
     * 默认目标分支，推送表单初始化时使用。
     */
    @Column(name = "default_target_branch", length = 100)
    private String defaultTargetBranch;

    /**
     * 默认推送方式：DIRECT（直接推送覆盖目标分支）/ NEW_BRANCH（推到交付子分支）/ MERGE_REQUEST（推到子分支并发起 MR）。
     */
    @Column(name = "default_push_mode", nullable = false, length = 20)
    private String defaultPushMode = "NEW_BRANCH";

    /**
     * 业主仓库访问 Token 密文，AES-GCM 加密，明文不入库。
     */
    @Column(name = "token_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String tokenCiphertext;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /**
     * 最近一次推送的执行状态（SUCCESS / PARTIAL / FAILED）。
     */
    @Column(name = "last_push_status", length = 30)
    private String lastPushStatus;

    @Column(name = "last_push_message", length = 500)
    private String lastPushMessage;

    @Column(name = "last_pushed_at")
    private LocalDateTime lastPushedAt;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
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

    public String getDefaultTargetBranch() {
        return defaultTargetBranch;
    }

    public void setDefaultTargetBranch(String defaultTargetBranch) {
        this.defaultTargetBranch = defaultTargetBranch;
    }

    public String getDefaultPushMode() {
        return defaultPushMode;
    }

    public void setDefaultPushMode(String defaultPushMode) {
        this.defaultPushMode = defaultPushMode;
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

    public String getLastPushStatus() {
        return lastPushStatus;
    }

    public void setLastPushStatus(String lastPushStatus) {
        this.lastPushStatus = lastPushStatus;
    }

    public String getLastPushMessage() {
        return lastPushMessage;
    }

    public void setLastPushMessage(String lastPushMessage) {
        this.lastPushMessage = lastPushMessage;
    }

    public LocalDateTime getLastPushedAt() {
        return lastPushedAt;
    }

    public void setLastPushedAt(LocalDateTime lastPushedAt) {
        this.lastPushedAt = lastPushedAt;
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
