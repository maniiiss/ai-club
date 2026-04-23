package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 需求工作项到 PRD Wiki 页面的投影关系。
 * 该表不改变工作项主事实，只负责记录 PRD 镜像落点与同步状态。
 */
@Entity
@Table(name = "task_prd_projection")
public class TaskPrdProjectionEntity {

    /** 工作项主键，同时作为投影关系主键。 */
    @Id
    @Column(name = "task_id")
    private Long taskId;

    /** 关联的需求工作项。 */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "task_id", nullable = false)
    private TaskEntity task;

    /** 所属项目。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /** PRD 所在 Wiki 空间。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "wiki_space_id")
    private WikiSpaceEntity wikiSpace;

    /** PRD 所在目录。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prd_wiki_directory_id")
    private WikiDirectoryEntity prdWikiDirectory;

    /** PRD 主页面。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "prd_wiki_page_id")
    private WikiPageV2Entity prdWikiPage;

    /** 投影状态：PENDING、READY、FAILED。 */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    /** 最近一次失败原因。 */
    @Column(name = "last_error", nullable = false, length = 1000)
    private String lastError = "";

    /** 最近一次成功生成 PRD 初稿时间。 */
    @Column(name = "last_generated_at")
    private LocalDateTime lastGeneratedAt;

    /** 最近一次生成 AI 建议时间。 */
    @Column(name = "last_ai_suggested_at")
    private LocalDateTime lastAiSuggestedAt;

    /** 最近一次用户确认写回时间。 */
    @Column(name = "last_user_confirmed_at")
    private LocalDateTime lastUserConfirmedAt;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getTaskId() {
        return taskId;
    }

    public void setTaskId(Long taskId) {
        this.taskId = taskId;
    }

    public TaskEntity getTask() {
        return task;
    }

    public void setTask(TaskEntity task) {
        this.task = task;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public WikiSpaceEntity getWikiSpace() {
        return wikiSpace;
    }

    public void setWikiSpace(WikiSpaceEntity wikiSpace) {
        this.wikiSpace = wikiSpace;
    }

    public WikiDirectoryEntity getPrdWikiDirectory() {
        return prdWikiDirectory;
    }

    public void setPrdWikiDirectory(WikiDirectoryEntity prdWikiDirectory) {
        this.prdWikiDirectory = prdWikiDirectory;
    }

    public WikiPageV2Entity getPrdWikiPage() {
        return prdWikiPage;
    }

    public void setPrdWikiPage(WikiPageV2Entity prdWikiPage) {
        this.prdWikiPage = prdWikiPage;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }

    public LocalDateTime getLastGeneratedAt() {
        return lastGeneratedAt;
    }

    public void setLastGeneratedAt(LocalDateTime lastGeneratedAt) {
        this.lastGeneratedAt = lastGeneratedAt;
    }

    public LocalDateTime getLastAiSuggestedAt() {
        return lastAiSuggestedAt;
    }

    public void setLastAiSuggestedAt(LocalDateTime lastAiSuggestedAt) {
        this.lastAiSuggestedAt = lastAiSuggestedAt;
    }

    public LocalDateTime getLastUserConfirmedAt() {
        return lastUserConfirmedAt;
    }

    public void setLastUserConfirmedAt(LocalDateTime lastUserConfirmedAt) {
        this.lastUserConfirmedAt = lastUserConfirmedAt;
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
