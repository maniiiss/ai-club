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
@Table(name = "gitlab_auto_merge_config")
public class GitlabAutoMergeConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 20)
    private String executionMode;

    @Column(nullable = false, length = 500)
    private String description = "";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "binding_id")
    private ProjectGitlabBindingEntity binding;

    @Column(name = "api_base_url", length = 255)
    private String apiBaseUrl;

    @Column(name = "gitlab_project_ref", length = 255)
    private String gitlabProjectRef;

    @Column(name = "token_ciphertext", columnDefinition = "TEXT")
    private String tokenCiphertext;

    @Column(name = "source_branch", length = 100)
    private String sourceBranch;

    @Column(name = "target_branch", length = 100)
    private String targetBranch;

    @Column(name = "title_keyword", length = 120)
    private String titleKeyword;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "auto_merge", nullable = false)
    private Boolean autoMerge = Boolean.TRUE;

    @Column(name = "squash_on_merge", nullable = false)
    private Boolean squashOnMerge = Boolean.FALSE;

    @Column(name = "remove_source_branch", nullable = false)
    private Boolean removeSourceBranch = Boolean.TRUE;

    @Column(name = "trigger_pipeline_after_merge", nullable = false)
    private Boolean triggerPipelineAfterMerge = Boolean.FALSE;

    @Column(name = "require_pipeline_success", nullable = false)
    private Boolean requirePipelineSuccess = Boolean.TRUE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ai_model_config_id")
    private AiModelConfigEntity aiModelConfig;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "review_agent_id")
    private AgentEntity reviewAgent;

    @Column(name = "ai_review_enabled", nullable = false)
    private Boolean aiReviewEnabled = Boolean.FALSE;

    @Column(name = "ai_review_prompt", columnDefinition = "TEXT")
    private String aiReviewPrompt;

    @Column(name = "scheduler_cron", length = 100)
    private String schedulerCron;

    @Column(name = "scheduler_enabled", nullable = false)
    private Boolean schedulerEnabled = Boolean.FALSE;

    @Column(name = "last_run_status", length = 30)
    private String lastRunStatus;

    @Column(name = "last_run_message", length = 500)
    private String lastRunMessage;

    @Column(name = "last_run_at")
    private LocalDateTime lastRunAt;

    @Column(name = "last_scheduled_at")
    private LocalDateTime lastScheduledAt;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getExecutionMode() {
        return executionMode;
    }

    public void setExecutionMode(String executionMode) {
        this.executionMode = executionMode;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public ProjectGitlabBindingEntity getBinding() {
        return binding;
    }

    public void setBinding(ProjectGitlabBindingEntity binding) {
        this.binding = binding;
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

    public String getTokenCiphertext() {
        return tokenCiphertext;
    }

    public void setTokenCiphertext(String tokenCiphertext) {
        this.tokenCiphertext = tokenCiphertext;
    }

    public String getSourceBranch() {
        return sourceBranch;
    }

    public void setSourceBranch(String sourceBranch) {
        this.sourceBranch = sourceBranch;
    }

    public String getTargetBranch() {
        return targetBranch;
    }

    public void setTargetBranch(String targetBranch) {
        this.targetBranch = targetBranch;
    }

    public String getTitleKeyword() {
        return titleKeyword;
    }

    public void setTitleKeyword(String titleKeyword) {
        this.titleKeyword = titleKeyword;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public Boolean getAutoMerge() {
        return autoMerge;
    }

    public void setAutoMerge(Boolean autoMerge) {
        this.autoMerge = autoMerge;
    }

    public Boolean getSquashOnMerge() {
        return squashOnMerge;
    }

    public void setSquashOnMerge(Boolean squashOnMerge) {
        this.squashOnMerge = squashOnMerge;
    }

    public Boolean getRemoveSourceBranch() {
        return removeSourceBranch;
    }

    public void setRemoveSourceBranch(Boolean removeSourceBranch) {
        this.removeSourceBranch = removeSourceBranch;
    }

    public Boolean getTriggerPipelineAfterMerge() {
        return triggerPipelineAfterMerge;
    }

    public void setTriggerPipelineAfterMerge(Boolean triggerPipelineAfterMerge) {
        this.triggerPipelineAfterMerge = triggerPipelineAfterMerge;
    }

    public Boolean getRequirePipelineSuccess() {
        return requirePipelineSuccess;
    }

    public void setRequirePipelineSuccess(Boolean requirePipelineSuccess) {
        this.requirePipelineSuccess = requirePipelineSuccess;
    }

    public AiModelConfigEntity getAiModelConfig() {
        return aiModelConfig;
    }

    public void setAiModelConfig(AiModelConfigEntity aiModelConfig) {
        this.aiModelConfig = aiModelConfig;
    }

    public AgentEntity getReviewAgent() {
        return reviewAgent;
    }

    public void setReviewAgent(AgentEntity reviewAgent) {
        this.reviewAgent = reviewAgent;
    }

    public Boolean getAiReviewEnabled() {
        return aiReviewEnabled;
    }

    public void setAiReviewEnabled(Boolean aiReviewEnabled) {
        this.aiReviewEnabled = aiReviewEnabled;
    }

    public String getAiReviewPrompt() {
        return aiReviewPrompt;
    }

    public void setAiReviewPrompt(String aiReviewPrompt) {
        this.aiReviewPrompt = aiReviewPrompt;
    }

    public String getSchedulerCron() {
        return schedulerCron;
    }

    public void setSchedulerCron(String schedulerCron) {
        this.schedulerCron = schedulerCron;
    }

    public Boolean getSchedulerEnabled() {
        return schedulerEnabled;
    }

    public void setSchedulerEnabled(Boolean schedulerEnabled) {
        this.schedulerEnabled = schedulerEnabled;
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

    public LocalDateTime getLastRunAt() {
        return lastRunAt;
    }

    public void setLastRunAt(LocalDateTime lastRunAt) {
        this.lastRunAt = lastRunAt;
    }

    public LocalDateTime getLastScheduledAt() {
        return lastScheduledAt;
    }

    public void setLastScheduledAt(LocalDateTime lastScheduledAt) {
        this.lastScheduledAt = lastScheduledAt;
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
