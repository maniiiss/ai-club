package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * LightRAG 索引队列记录（PG outbox）。
 * 业务意图：Wiki 页面保存/删除时同事务入队，code-processing 消费者异步调用 LightRAG 抽取，
 * 避免同步 LLM 调用拖死编辑接口，同时保证「页面存了、入队前宕机」不丢消息。
 */
@Entity
@Table(name = "lightrag_ingest_queue")
public class LightRagIngestQueueEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 命名空间，形如 'space:{id}' 或 'project:{id}'，对应 LightRAG workspace 隔离。 */
    @Column(name = "namespace", nullable = false, length = 128)
    private String namespace;

    @Column(name = "page_id", nullable = false)
    private Long pageId;

    /** 页面版本号，删除时为 null。 */
    @Column(name = "page_version")
    private Integer pageVersion;

    /** 操作类型：UPSERT 或 DELETE。 */
    @Column(name = "op", nullable = false, length = 16)
    private String op;

    /** 状态：PENDING / PROCESSING / DONE / FAILED / DEAD。 */
    @Column(name = "status", nullable = false, length = 16)
    private String status;

    @Column(name = "retry_count", nullable = false)
    private int retryCount;

    @Column(name = "last_error", length = 4000)
    private String lastError;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 消费者抢占锁的截止时间，超过后可被其他消费者重新抢占。 */
    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (status == null) {
            status = "PENDING";
        }
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNamespace() {
        return namespace;
    }

    public void setNamespace(String namespace) {
        this.namespace = namespace;
    }

    public Long getPageId() {
        return pageId;
    }

    public void setPageId(Long pageId) {
        this.pageId = pageId;
    }

    public Integer getPageVersion() {
        return pageVersion;
    }

    public void setPageVersion(Integer pageVersion) {
        this.pageVersion = pageVersion;
    }

    public String getOp() {
        return op;
    }

    public void setOp(String op) {
        this.op = op;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getRetryCount() {
        return retryCount;
    }

    public void setRetryCount(int retryCount) {
        this.retryCount = retryCount;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public LocalDateTime getLockedUntil() {
        return lockedUntil;
    }

    public void setLockedUntil(LocalDateTime lockedUntil) {
        this.lockedUntil = lockedUntil;
    }
}
