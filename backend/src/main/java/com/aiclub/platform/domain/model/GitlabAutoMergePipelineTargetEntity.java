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
 * GitLab 自动合并成功后要触发的目标流水线。
 *
 * <p>同一条记录只允许指向一种目标类型：AI Club Pipeline 或 Jenkins 绑定。
 * 这样既能支持多选，也能在目标被删除时借助外键级联自动清理失效配置。</p>
 */
@Entity
@Table(name = "gitlab_auto_merge_pipeline_target")
public class GitlabAutoMergePipelineTargetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 所属自动合并策略。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "config_id", nullable = false)
    private GitlabAutoMergeConfigEntity config;

    /**
     * 目标类型：AI_CLUB / JENKINS。
     */
    @Column(name = "target_type", nullable = false, length = 20)
    private String targetType;

    /**
     * AI Club 内置流水线目标。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ai_club_pipeline_id")
    private AiClubPipelineEntity aiClubPipeline;

    /**
     * 项目级 Jenkins 绑定目标。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "jenkins_binding_id")
    private ProjectPipelineBindingEntity jenkinsBinding;

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

    public GitlabAutoMergeConfigEntity getConfig() {
        return config;
    }

    public void setConfig(GitlabAutoMergeConfigEntity config) {
        this.config = config;
    }

    public String getTargetType() {
        return targetType;
    }

    public void setTargetType(String targetType) {
        this.targetType = targetType;
    }

    public AiClubPipelineEntity getAiClubPipeline() {
        return aiClubPipeline;
    }

    public void setAiClubPipeline(AiClubPipelineEntity aiClubPipeline) {
        this.aiClubPipeline = aiClubPipeline;
    }

    public ProjectPipelineBindingEntity getJenkinsBinding() {
        return jenkinsBinding;
    }

    public void setJenkinsBinding(ProjectPipelineBindingEntity jenkinsBinding) {
        this.jenkinsBinding = jenkinsBinding;
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
