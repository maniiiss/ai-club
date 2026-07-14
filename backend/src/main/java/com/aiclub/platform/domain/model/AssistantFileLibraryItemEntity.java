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
 * Assistant 个人文件库条目。
 * 业务意图：把用户主动上传的长期参考文件与一次性会话附件区分开，作为个人知识库参与 Assistant 召回。
 */
@Entity
@Table(name = "hermes_file_library_item")
public class AssistantFileLibraryItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 文件库条目归属用户，所有查询、下载和召回都按用户隔离。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_user_id", nullable = false)
    private UserEntity ownerUser;

    /** 原始文件资产，下载仍复用 document_asset 的归属校验。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_asset_id", nullable = false)
    private DocumentAssetEntity documentAsset;

    @Column(nullable = false, length = 200)
    private String title = "";

    @Column(nullable = false, length = 500)
    private String description = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String markdown = "";

    @Column(name = "source_format", nullable = false, length = 20)
    private String sourceFormat = "";

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "index_status", nullable = false, length = 20)
    private String indexStatus = "PENDING";

    @Column(name = "warnings_json", nullable = false, columnDefinition = "TEXT")
    private String warningsJson = "[]";

    @Column(name = "last_error", nullable = false, columnDefinition = "TEXT")
    private String lastError = "";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

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

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public UserEntity getOwnerUser() {
        return ownerUser;
    }

    public void setOwnerUser(UserEntity ownerUser) {
        this.ownerUser = ownerUser;
    }

    public DocumentAssetEntity getDocumentAsset() {
        return documentAsset;
    }

    public void setDocumentAsset(DocumentAssetEntity documentAsset) {
        this.documentAsset = documentAsset;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getMarkdown() {
        return markdown;
    }

    public void setMarkdown(String markdown) {
        this.markdown = markdown;
    }

    public String getSourceFormat() {
        return sourceFormat;
    }

    public void setSourceFormat(String sourceFormat) {
        this.sourceFormat = sourceFormat;
    }

    public long getFileSize() {
        return fileSize;
    }

    public void setFileSize(long fileSize) {
        this.fileSize = fileSize;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getIndexStatus() {
        return indexStatus;
    }

    public void setIndexStatus(String indexStatus) {
        this.indexStatus = indexStatus;
    }

    public String getWarningsJson() {
        return warningsJson;
    }

    public void setWarningsJson(String warningsJson) {
        this.warningsJson = warningsJson;
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
