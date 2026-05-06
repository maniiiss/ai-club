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
 * 首页常用系统访问入口实体。
 * 统一承载系统管理员维护的系统级入口，以及当前用户自维护的个人入口。
 */
@Entity
@Table(name = "dashboard_shortcut_entry")
public class DashboardShortcutEntryEntity {

    /** 主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 入口归属范围：
     * SYSTEM 表示管理员统一维护的系统级入口；
     * USER 表示当前登录用户自己的入口。
     */
    @Column(name = "scope_type", nullable = false, length = 20)
    private String scopeType = "USER";

    /**
     * 个人入口所属用户。
     * 当 scopeType=SYSTEM 时允许为空。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private UserEntity ownerUser;

    /** 入口名称。 */
    @Column(nullable = false, length = 120)
    private String name = "";

    /** 入口跳转地址。 */
    @Column(nullable = false, length = 500)
    private String url = "";

    /**
     * Element Plus 图标名称。
     * 前端通过统一图标映射兜底渲染，避免非法值导致页面报错。
     */
    @Column(nullable = false, length = 500)
    private String icon = "";

    /** 是否启用。 */
    @Column(nullable = false)
    private boolean enabled = true;

    /** 同一范围内的展示顺序。 */
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * 首次入库时补齐时间字段，保持数据库默认值与 JPA 行为一致。
     */
    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    /**
     * 每次更新时刷新更新时间，便于后续排查入口变更记录。
     */
    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getScopeType() {
        return scopeType;
    }

    public void setScopeType(String scopeType) {
        this.scopeType = scopeType;
    }

    public UserEntity getOwnerUser() {
        return ownerUser;
    }

    public void setOwnerUser(UserEntity ownerUser) {
        this.ownerUser = ownerUser;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getIcon() {
        return icon;
    }

    public void setIcon(String icon) {
        this.icon = icon;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
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
