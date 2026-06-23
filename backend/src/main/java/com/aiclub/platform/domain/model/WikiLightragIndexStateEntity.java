package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * LightRAG 索引状态表。
 * 业务意图：记录每个页面最后成功索引的版本，供定时兜底扫描判定「未更新」页面补入队。
 * 这张表是去重与漏网判定的数据源，LightRAG 本身不提供。
 */
@Entity
@Table(name = "wiki_lightrag_index_state")
public class WikiLightragIndexStateEntity {

    @Id
    @Column(name = "page_id")
    private Long pageId;

    @Column(name = "namespace", nullable = false, length = 128)
    private String namespace;

    @Column(name = "indexed_version")
    private Integer indexedVersion;

    @Column(name = "indexed_at")
    private LocalDateTime indexedAt;

    /** 状态：PENDING / INDEXED / FAILED。 */
    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "last_error", length = 4000)
    private String lastError;

    @PrePersist
    void prePersist() {
        if (status == null) {
            status = "PENDING";
        }
    }

    @PreUpdate
    void preUpdate() {
        // 占位，便于后续加字段时统一维护更新时间。
    }

    public Long getPageId() {
        return pageId;
    }

    public void setPageId(Long pageId) {
        this.pageId = pageId;
    }

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public Integer getIndexedVersion() {
        return indexedVersion;
    }

    public void setIndexedVersion(Integer indexedVersion) {
        this.indexedVersion = indexedVersion;
    }

    public LocalDateTime getIndexedAt() {
        return indexedAt;
    }

    public void setIndexedAt(LocalDateTime indexedAt) {
        this.indexedAt = indexedAt;
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
}
