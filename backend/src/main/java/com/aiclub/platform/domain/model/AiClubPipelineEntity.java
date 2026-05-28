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
@Table(name = "ai_club_pipeline")
public class AiClubPipelineEntity {

    public static final String PROVIDER_WOODPECKER = "WOODPECKER";

    /**
     * 平台流水线定义主键。
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 关联的业务项目，流水线权限跟随项目可见范围。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 关联的平台 GitLab 仓库绑定，用于让 AI Club Pipeline 定位业务代码仓库。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "gitlab_binding_id", nullable = false)
    private ProjectGitlabBindingEntity gitlabBinding;

    /**
     * 平台内展示的流水线名称。
     */
    @Column(nullable = false, length = 120)
    private String name;

    /**
     * 内置 provider 编码。首版固定为 WOODPECKER，保留字段便于后续扩展。
     */
    @Column(name = "provider_code", nullable = false, length = 30)
    private String providerCode = PROVIDER_WOODPECKER;

    /**
     * 默认触发分支，未填写时回退到 GitLab 绑定的默认目标分支。
     */
    @Column(name = "default_branch", length = 100)
    private String defaultBranch;

    /**
     * Woodpecker YAML 配置文件路径，用于平台侧定义和展示流水线入口。
     */
    @Column(name = "config_path", nullable = false, length = 255)
    private String configPath = ".woodpecker.yml";

    /**
     * 固定触发变量 JSON。用于在平台触发 Woodpecker 时，为同一份 YAML 传入不同的业务参数。
     */
    @Column(name = "trigger_variables_json", columnDefinition = "TEXT")
    private String triggerVariablesJson;

    /**
     * Woodpecker 仓库 ID，平台触发和读取运行历史时使用。
     */
    @Column(name = "woodpecker_repo_id")
    private Long woodpeckerRepoId;

    /**
     * Woodpecker 仓库完整路径快照，例如 group/project。
     */
    @Column(name = "woodpecker_repo_full_name", length = 255)
    private String woodpeckerRepoFullName;

    /**
     * Woodpecker 或 GitLab 仓库页面地址，用于前端跳转。
     */
    @Column(name = "woodpecker_repo_url", length = 500)
    private String woodpeckerRepoUrl;

    /**
     * 是否允许由平台触发该流水线。
     */
    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /**
     * 最近一次运行状态快照，由平台按需触发或拉取后更新。
     */
    @Column(name = "last_run_status", length = 30)
    private String lastRunStatus;

    /**
     * 最近一次运行说明。
     */
    @Column(name = "last_run_message", length = 500)
    private String lastRunMessage;

    /**
     * 最近一次 Woodpecker pipeline number。
     */
    @Column(name = "last_run_number")
    private Integer lastRunNumber;

    /**
     * 最近一次运行跳转链接。
     */
    @Column(name = "last_run_url", length = 500)
    private String lastRunUrl;

    /**
     * 最近一次由平台触发的时间。
     */
    @Column(name = "last_triggered_at")
    private LocalDateTime lastTriggeredAt;

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

    public ProjectGitlabBindingEntity getGitlabBinding() {
        return gitlabBinding;
    }

    public void setGitlabBinding(ProjectGitlabBindingEntity gitlabBinding) {
        this.gitlabBinding = gitlabBinding;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getProviderCode() {
        return providerCode;
    }

    public void setProviderCode(String providerCode) {
        this.providerCode = providerCode;
    }

    public String getDefaultBranch() {
        return defaultBranch;
    }

    public void setDefaultBranch(String defaultBranch) {
        this.defaultBranch = defaultBranch;
    }

    public String getConfigPath() {
        return configPath;
    }

    public void setConfigPath(String configPath) {
        this.configPath = configPath;
    }

    public String getTriggerVariablesJson() {
        return triggerVariablesJson;
    }

    public void setTriggerVariablesJson(String triggerVariablesJson) {
        this.triggerVariablesJson = triggerVariablesJson;
    }

    public Long getWoodpeckerRepoId() {
        return woodpeckerRepoId;
    }

    public void setWoodpeckerRepoId(Long woodpeckerRepoId) {
        this.woodpeckerRepoId = woodpeckerRepoId;
    }

    public String getWoodpeckerRepoFullName() {
        return woodpeckerRepoFullName;
    }

    public void setWoodpeckerRepoFullName(String woodpeckerRepoFullName) {
        this.woodpeckerRepoFullName = woodpeckerRepoFullName;
    }

    public String getWoodpeckerRepoUrl() {
        return woodpeckerRepoUrl;
    }

    public void setWoodpeckerRepoUrl(String woodpeckerRepoUrl) {
        this.woodpeckerRepoUrl = woodpeckerRepoUrl;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getLastRunStatus() {
        return lastRunStatus;
    }

    public void setLastRunStatus(String lastRunStatus) {
        this.lastRunStatus = lastRunStatus;
    }

    public String getLastRunMessage() {
        return lastRunMessage;
    }

    public void setLastRunMessage(String lastRunMessage) {
        this.lastRunMessage = lastRunMessage;
    }

    public Integer getLastRunNumber() {
        return lastRunNumber;
    }

    public void setLastRunNumber(Integer lastRunNumber) {
        this.lastRunNumber = lastRunNumber;
    }

    public String getLastRunUrl() {
        return lastRunUrl;
    }

    public void setLastRunUrl(String lastRunUrl) {
        this.lastRunUrl = lastRunUrl;
    }

    public LocalDateTime getLastTriggeredAt() {
        return lastTriggeredAt;
    }

    public void setLastTriggeredAt(LocalDateTime lastTriggeredAt) {
        this.lastTriggeredAt = lastTriggeredAt;
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
