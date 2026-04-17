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
 * 空间化 Wiki 页面 Hindsight 同步出站任务。
 */
@Entity
@Table(name = "wiki_page_sync_task_v2")
public class WikiPageSyncTaskV2Entity {

    /** 同步任务主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属空间。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "space_id", nullable = false)
    private WikiSpaceEntity space;

    /** 对应页面，删除任务允许为空。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "page_id")
    private WikiPageV2Entity page;

    /** 同步操作：RETAIN 或 DELETE。 */
    @Column(nullable = false, length = 20)
    private String operation = "RETAIN";

    /** Hindsight 文档 ID。 */
    @Column(name = "document_id", nullable = false, length = 120)
    private String documentId = "";

    /** 任务状态：PENDING、RUNNING、SYNCED、FAILED。 */
    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    /** 已尝试次数。 */
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    /** 最大尝试次数。 */
    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts = 5;

    /** 下次可执行时间。 */
    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    /** 最近一次失败摘要。 */
    @Column(name = "last_error", nullable = false, length = 1000)
    private String lastError = "";

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
        if (nextAttemptAt == null) {
            nextAttemptAt = now;
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

    public WikiPageV2Entity getPage() {
        return page;
    }

    public void setPage(WikiPageV2Entity page) {
        this.page = page;
    }

    public String getOperation() {
        return operation;
    }

    public void setOperation(String operation) {
        this.operation = operation;
    }

    public String getDocumentId() {
        return documentId;
    }

    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(int attemptCount) {
        this.attemptCount = attemptCount;
    }

    public int getMaxAttempts() {
        return maxAttempts;
    }

    public void setMaxAttempts(int maxAttempts) {
        this.maxAttempts = maxAttempts;
    }

    public LocalDateTime getNextAttemptAt() {
        return nextAttemptAt;
    }

    public void setNextAttemptAt(LocalDateTime nextAttemptAt) {
        this.nextAttemptAt = nextAttemptAt;
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
