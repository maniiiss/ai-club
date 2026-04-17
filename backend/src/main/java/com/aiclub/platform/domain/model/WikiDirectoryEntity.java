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
 * Wiki 目录实体，用于组织空间内页面结构，并可选关联项目。
 */
@Entity
@Table(name = "wiki_directory")
public class WikiDirectoryEntity {

    /** 目录主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属空间。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private WikiSpaceEntity space;

    /** 父目录，为空表示根目录。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_directory_id")
    private WikiDirectoryEntity parentDirectory;

    /** 目录名称。 */
    @Column(nullable = false, length = 120)
    private String name = "";

    /** 同级目录下稳定 slug。 */
    @Column(nullable = false, length = 160)
    private String slug = "";

    /** 目录正文，允许目录本身承载说明内容。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content = "";

    /** 同级排序号。 */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 可选绑定项目，仅用于关联检索与图谱。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bound_project_id")
    private ProjectEntity boundProject;

    /** 目录创建人。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_user_id")
    private UserEntity createdByUser;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 最近更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * 首次保存前补齐时间戳。
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
     * 更新前刷新修改时间。
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

    public WikiSpaceEntity getSpace() {
        return space;
    }

    public void setSpace(WikiSpaceEntity space) {
        this.space = space;
    }

    public WikiDirectoryEntity getParentDirectory() {
        return parentDirectory;
    }

    public void setParentDirectory(WikiDirectoryEntity parentDirectory) {
        this.parentDirectory = parentDirectory;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
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

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public ProjectEntity getBoundProject() {
        return boundProject;
    }

    public void setBoundProject(ProjectEntity boundProject) {
        this.boundProject = boundProject;
    }

    public UserEntity getCreatedByUser() {
        return createdByUser;
    }

    public void setCreatedByUser(UserEntity createdByUser) {
        this.createdByUser = createdByUser;
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
