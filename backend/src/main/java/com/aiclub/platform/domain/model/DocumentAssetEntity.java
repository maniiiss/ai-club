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
 * 平台通用文档资产，统一保存可被转换、追溯和下载的原始文档。
 */
@Entity
@Table(name = "document_asset")
public class DocumentAssetEntity {

    /** 资产主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 上传并拥有该文档资产的用户。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_user_id", nullable = false)
    private UserEntity ownerUser;

    /** 原始文件名，用于前端回显和下载文件名。 */
    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName = "";

    /** 上传时识别到的内容类型。 */
    @Column(name = "content_type", nullable = false, length = 120)
    private String contentType = "";

    /** 原始文件字节大小。 */
    @Column(name = "file_size", nullable = false)
    private long fileSize;

    /** MinIO 中保存原始文件的对象键。 */
    @Column(name = "object_key", nullable = false, length = 500)
    private String objectKey = "";

    /** 源文件格式，例如 PDF、DOCX、PPTX、XLSX。 */
    @Column(name = "source_format", nullable = false, length = 20)
    private String sourceFormat = "";

    /** 绑定状态：TEMP 表示临时资产，BOUND 表示已绑定业务对象。 */
    @Column(name = "binding_status", nullable = false, length = 20)
    private String bindingStatus = "TEMP";

    /** 绑定业务类型，例如 WIKI_PAGE 或 HERMES_ATTACHMENT。 */
    @Column(name = "bound_biz_type", nullable = false, length = 50)
    private String boundBizType = "";

    /** 绑定业务ID，配合绑定业务类型定位来源。 */
    @Column(name = "bound_biz_id")
    private Long boundBizId;

    /** 资产创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 资产最近更新时间。 */
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
     * 更新前刷新更新时间。
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

    public UserEntity getOwnerUser() {
        return ownerUser;
    }

    public void setOwnerUser(UserEntity ownerUser) {
        this.ownerUser = ownerUser;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getFileSize() {
        return fileSize;
    }

    public void setFileSize(long fileSize) {
        this.fileSize = fileSize;
    }

    public String getObjectKey() {
        return objectKey;
    }

    public void setObjectKey(String objectKey) {
        this.objectKey = objectKey;
    }

    public String getSourceFormat() {
        return sourceFormat;
    }

    public void setSourceFormat(String sourceFormat) {
        this.sourceFormat = sourceFormat;
    }

    public String getBindingStatus() {
        return bindingStatus;
    }

    public void setBindingStatus(String bindingStatus) {
        this.bindingStatus = bindingStatus;
    }

    public String getBoundBizType() {
        return boundBizType;
    }

    public void setBoundBizType(String boundBizType) {
        this.boundBizType = boundBizType;
    }

    public Long getBoundBizId() {
        return boundBizId;
    }

    public void setBoundBizId(Long boundBizId) {
        this.boundBizId = boundBizId;
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
