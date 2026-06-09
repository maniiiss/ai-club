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
 * 项目日志采集游标。
 * 记录每个运行实例在每个日志文件上的读取偏移和未闭合尾行，支撑断点续采。
 */
@Entity
@Table(name = "project_log_cursor")
public class ProjectLogCursorEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 该游标所属运行实例。
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "runtime_instance_id", nullable = false)
    private ProjectRuntimeInstanceEntity runtimeInstance;

    /**
     * 远端日志文件路径。
     */
    @Column(name = "source_path", nullable = false, length = 500)
    private String sourcePath;

    /**
     * 下次采集应继续读取的字节偏移。
     */
    @Column(name = "byte_offset", nullable = false)
    private Long byteOffset = 0L;

    /**
     * 最近一次采集看到的文件修改时间戳，秒级。
     */
    @Column(name = "last_modified_epoch_seconds")
    private Long lastModifiedEpochSeconds;

    /**
     * 最近一次采集看到的文件大小。
     */
    @Column(name = "last_file_size")
    private Long lastFileSize;

    /**
     * 最近一次采样时文件头部内容哈希，用于识别同路径日志轮转或替换。
     */
    @Column(name = "last_head_hash", length = 64)
    private String lastHeadHash;

    /**
     * 分块读取时尚未凑成完整行的尾部文本。
     */
    @Column(name = "pending_text", nullable = false, columnDefinition = "TEXT")
    private String pendingText = "";

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        updatedAt = LocalDateTime.now();
    }

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

    public ProjectRuntimeInstanceEntity getRuntimeInstance() {
        return runtimeInstance;
    }

    public void setRuntimeInstance(ProjectRuntimeInstanceEntity runtimeInstance) {
        this.runtimeInstance = runtimeInstance;
    }

    public String getSourcePath() {
        return sourcePath;
    }

    public void setSourcePath(String sourcePath) {
        this.sourcePath = sourcePath;
    }

    public Long getByteOffset() {
        return byteOffset;
    }

    public void setByteOffset(Long byteOffset) {
        this.byteOffset = byteOffset;
    }

    public Long getLastModifiedEpochSeconds() {
        return lastModifiedEpochSeconds;
    }

    public void setLastModifiedEpochSeconds(Long lastModifiedEpochSeconds) {
        this.lastModifiedEpochSeconds = lastModifiedEpochSeconds;
    }

    public Long getLastFileSize() {
        return lastFileSize;
    }

    public void setLastFileSize(Long lastFileSize) {
        this.lastFileSize = lastFileSize;
    }

    public String getPendingText() {
        return pendingText;
    }

    public void setPendingText(String pendingText) {
        this.pendingText = pendingText;
    }

    public String getLastHeadHash() {
        return lastHeadHash;
    }

    public void setLastHeadHash(String lastHeadHash) {
        this.lastHeadHash = lastHeadHash;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
