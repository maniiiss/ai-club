package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 平台项目与 Yaade 顶级 collection 的绑定快照。
 * 只保存映射关系与同步状态，不保存接口正文。
 */
@Entity
@Table(name = "platform_yaade_project_binding")
public class PlatformYaadeProjectBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 平台项目 ID；这里不做外键约束，便于项目删除后保留 Yaade 归档记录。
     */
    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /**
     * Yaade collection 主键，用于后续重命名、修复同步和 iframe 聚焦。
     */
    @Column(name = "yaade_collection_id", nullable = false)
    private Long yaadeCollectionId;

    /**
     * Yaade 没有独立 group 表，项目隔离直接依赖 group 名称。
     */
    @Column(name = "yaade_group_name", nullable = false, length = 120)
    private String yaadeGroupName;

    @Column(nullable = false, length = 20)
    private String status;

    /**
     * 项目删除后写入归档名称，便于平台侧排障和人工回溯。
     */
    @Column(name = "archived_name", length = 255)
    private String archivedName;

    @Column(name = "last_synced_at", nullable = false)
    private LocalDateTime lastSyncedAt = LocalDateTime.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public void setProjectId(Long projectId) {
        this.projectId = projectId;
    }

    public Long getYaadeCollectionId() {
        return yaadeCollectionId;
    }

    public void setYaadeCollectionId(Long yaadeCollectionId) {
        this.yaadeCollectionId = yaadeCollectionId;
    }

    public String getYaadeGroupName() {
        return yaadeGroupName;
    }

    public void setYaadeGroupName(String yaadeGroupName) {
        this.yaadeGroupName = yaadeGroupName;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getArchivedName() {
        return archivedName;
    }

    public void setArchivedName(String archivedName) {
        this.archivedName = archivedName;
    }

    public LocalDateTime getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(LocalDateTime lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }
}
