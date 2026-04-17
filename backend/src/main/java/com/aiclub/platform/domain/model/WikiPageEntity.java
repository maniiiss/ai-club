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
 * Wiki 页面主实体，保存项目内可编辑知识页面的当前版本内容。
 */
@Entity
@Table(name = "wiki_page")
public class WikiPageEntity {

    /** Wiki 页面主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 页面所属项目。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /** 父页面，为空时表示项目 Wiki 根页面。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_page_id")
    private WikiPageEntity parentPage;

    /** 页面标题。 */
    @Column(nullable = false, length = 200)
    private String title = "";

    /** 项目内稳定访问路径片段。 */
    @Column(nullable = false, length = 200)
    private String slug = "";

    /** 当前版本的 Markdown 正文。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content = "";

    /** 页面可见范围：PUBLIC、PROJECT_MEMBERS、SPECIFIC_USERS。 */
    @Column(name = "visibility_scope", nullable = false, length = 30)
    private String visibilityScope = "PROJECT_MEMBERS";

    /** 同级页面排序号，首版只自动生成不提供拖拽调整。 */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 当前页面内容对应的最新版本号。 */
    @Column(name = "current_version_number", nullable = false)
    private int currentVersionNumber = 1;

    /** Hindsight 同步状态：PENDING、SYNCED、FAILED。 */
    @Column(name = "sync_status", nullable = false, length = 20)
    private String syncStatus = "PENDING";

    /** 最近一次成功同步到 Hindsight 的时间。 */
    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    /** 最近一次同步失败的错误摘要。 */
    @Column(name = "last_sync_error", nullable = false, length = 1000)
    private String lastSyncError = "";

    /** 页面创建人，也是默认编辑者。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_user_id")
    private UserEntity authorUser;

    /** 页面创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 页面最近更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * 首次保存前补齐时间字段，避免数据库默认值与 JPA 状态不一致。
     */
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

    /**
     * 每次页面主记录更新时刷新更新时间。
     */
    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
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

    public WikiPageEntity getParentPage() {
        return parentPage;
    }

    public void setParentPage(WikiPageEntity parentPage) {
        this.parentPage = parentPage;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getVisibilityScope() {
        return visibilityScope;
    }

    public void setVisibilityScope(String visibilityScope) {
        this.visibilityScope = visibilityScope;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public int getCurrentVersionNumber() {
        return currentVersionNumber;
    }

    public void setCurrentVersionNumber(int currentVersionNumber) {
        this.currentVersionNumber = currentVersionNumber;
    }

    public String getSyncStatus() {
        return syncStatus;
    }

    public void setSyncStatus(String syncStatus) {
        this.syncStatus = syncStatus;
    }

    public LocalDateTime getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(LocalDateTime lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }

    public String getLastSyncError() {
        return lastSyncError;
    }

    public void setLastSyncError(String lastSyncError) {
        this.lastSyncError = lastSyncError;
    }

    public UserEntity getAuthorUser() {
        return authorUser;
    }

    public void setAuthorUser(UserEntity authorUser) {
        this.authorUser = authorUser;
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
