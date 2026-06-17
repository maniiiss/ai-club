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

@Entity
@Table(name = "gitlab_auto_merge_log")
public class GitlabAutoMergeLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "config_id")
    private GitlabAutoMergeConfigEntity config;

    /**
     * 项目快照，用于配置或绑定删除后的日志数据权限过滤。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private ProjectEntity project;

    @Column(name = "config_name", nullable = false, length = 120)
    private String configName;

    @Column(name = "trigger_type", nullable = false, length = 20)
    private String triggerType;

    @Column(name = "merge_request_iid")
    private Long mergeRequestIid;

    @Column(name = "merge_request_title", length = 255)
    private String mergeRequestTitle;

    @Column(name = "merge_request_author_name", length = 255)
    private String mergeRequestAuthorName;

    @Column(name = "merge_request_author_username", length = 100)
    private String mergeRequestAuthorUsername;

    /**
     * GitLab 项目标识快照，用于在配置变更后仍能按“项目 + MR IID”回溯历史审查记录。
     */
    @Column(name = "gitlab_project_ref_snapshot", length = 255)
    private String gitlabProjectRefSnapshot;

    @Column(nullable = false, length = 30)
    private String result;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    /**
     * 当前这次审查后仍需处理的问题列表，下一次同一 MR 复审时会继续带入。
     */
    @Column(name = "review_issues_json", columnDefinition = "TEXT")
    private String reviewIssuesJson;

    /**
     * 本次复审已确认修复的历史问题列表。
     */
    @Column(name = "resolved_previous_issues_json", columnDefinition = "TEXT")
    private String resolvedPreviousIssuesJson;

    /**
     * 本次复审仍未修复的历史问题列表。
     */
    @Column(name = "unresolved_previous_issues_json", columnDefinition = "TEXT")
    private String unresolvedPreviousIssuesJson;

    @Column(name = "detail_markdown", columnDefinition = "TEXT")
    private String detailMarkdown;

    @Column(name = "web_url", length = 500)
    private String webUrl;

    @Column(name = "executed_at", nullable = false)
    private LocalDateTime executedAt;

    @PrePersist
    public void onCreate() {
        if (this.executedAt == null) {
            this.executedAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public GitlabAutoMergeConfigEntity getConfig() {
        return config;
    }

    public void setConfig(GitlabAutoMergeConfigEntity config) {
        this.config = config;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public String getConfigName() {
        return configName;
    }

    public void setConfigName(String configName) {
        this.configName = configName;
    }

    public String getTriggerType() {
        return triggerType;
    }

    public void setTriggerType(String triggerType) {
        this.triggerType = triggerType;
    }

    public Long getMergeRequestIid() {
        return mergeRequestIid;
    }

    public void setMergeRequestIid(Long mergeRequestIid) {
        this.mergeRequestIid = mergeRequestIid;
    }

    public String getMergeRequestTitle() {
        return mergeRequestTitle;
    }

    public void setMergeRequestTitle(String mergeRequestTitle) {
        this.mergeRequestTitle = mergeRequestTitle;
    }

    public String getMergeRequestAuthorName() {
        return mergeRequestAuthorName;
    }

    public void setMergeRequestAuthorName(String mergeRequestAuthorName) {
        this.mergeRequestAuthorName = mergeRequestAuthorName;
    }

    public String getMergeRequestAuthorUsername() {
        return mergeRequestAuthorUsername;
    }

    public void setMergeRequestAuthorUsername(String mergeRequestAuthorUsername) {
        this.mergeRequestAuthorUsername = mergeRequestAuthorUsername;
    }

    public String getGitlabProjectRefSnapshot() {
        return gitlabProjectRefSnapshot;
    }

    public void setGitlabProjectRefSnapshot(String gitlabProjectRefSnapshot) {
        this.gitlabProjectRefSnapshot = gitlabProjectRefSnapshot;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getReviewIssuesJson() {
        return reviewIssuesJson;
    }

    public void setReviewIssuesJson(String reviewIssuesJson) {
        this.reviewIssuesJson = reviewIssuesJson;
    }

    public String getResolvedPreviousIssuesJson() {
        return resolvedPreviousIssuesJson;
    }

    public void setResolvedPreviousIssuesJson(String resolvedPreviousIssuesJson) {
        this.resolvedPreviousIssuesJson = resolvedPreviousIssuesJson;
    }

    public String getUnresolvedPreviousIssuesJson() {
        return unresolvedPreviousIssuesJson;
    }

    public void setUnresolvedPreviousIssuesJson(String unresolvedPreviousIssuesJson) {
        this.unresolvedPreviousIssuesJson = unresolvedPreviousIssuesJson;
    }

    public String getDetailMarkdown() {
        return detailMarkdown;
    }

    public void setDetailMarkdown(String detailMarkdown) {
        this.detailMarkdown = detailMarkdown;
    }

    public String getWebUrl() {
        return webUrl;
    }

    public void setWebUrl(String webUrl) {
        this.webUrl = webUrl;
    }

    public LocalDateTime getExecutedAt() {
        return executedAt;
    }

    public void setExecutedAt(LocalDateTime executedAt) {
        this.executedAt = executedAt;
    }
}
