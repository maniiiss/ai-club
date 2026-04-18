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
 * Wiki 空间实体，作为知识内容的顶层容器。
 */
@Entity
@Table(name = "wiki_space")
public class WikiSpaceEntity {

    /** 空间主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 空间名称。 */
    @Column(nullable = false, length = 120)
    private String name = "";

    /** 空间说明。 */
    @Column(nullable = false, length = 500)
    private String description = "";

    /** 空间读取范围：MEMBERS_ONLY 或 ALL_LOGGED_IN。 */
    @Column(name = "read_scope", nullable = false, length = 20)
    private String readScope = "MEMBERS_ONLY";

    /** 空间级默认绑定项目，目录未单独指定时可向下继承。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bound_project_id")
    private ProjectEntity boundProject;

    /** 空间成员默认来源：MANUAL 或 PROJECT_MEMBERS。 */
    @Column(name = "member_default_source", nullable = false, length = 30)
    private String memberDefaultSource = "MANUAL";

    /** 空间创建者。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creator_user_id")
    private UserEntity creatorUser;

    /** 空间创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 空间最近更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * 首次入库前补齐时间戳。
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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getReadScope() {
        return readScope;
    }

    public void setReadScope(String readScope) {
        this.readScope = readScope;
    }

    public ProjectEntity getBoundProject() {
        return boundProject;
    }

    public void setBoundProject(ProjectEntity boundProject) {
        this.boundProject = boundProject;
    }

    public String getMemberDefaultSource() {
        return memberDefaultSource;
    }

    public void setMemberDefaultSource(String memberDefaultSource) {
        this.memberDefaultSource = memberDefaultSource;
    }

    public UserEntity getCreatorUser() {
        return creatorUser;
    }

    public void setCreatorUser(UserEntity creatorUser) {
        this.creatorUser = creatorUser;
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
