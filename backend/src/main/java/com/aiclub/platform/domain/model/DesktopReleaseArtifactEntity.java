package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * GitPilot Desktop 单个发布产物。
 * 业务意图：把安装器、updater 压缩包和签名按平台矩阵独立保存，更新清单可以精确选包。
 */
@Entity
@Table(name = "desktop_release_artifact")
public class DesktopReleaseArtifactEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "release_id", nullable = false)
    private Long releaseId;

    @Column(name = "artifact_kind", nullable = false, length = 20)
    private String artifactKind;

    @Column(nullable = false, length = 30)
    private String platform;

    @Column(nullable = false, length = 40)
    private String arch;

    @Column(name = "bundle_type", nullable = false, length = 20)
    private String bundleType;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "object_key", nullable = false, unique = true, length = 500)
    private String objectKey;

    @Column(name = "content_type", nullable = false, length = 150)
    private String contentType = "application/octet-stream";

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "signature_text", nullable = false, columnDefinition = "TEXT")
    private String signatureText = "";

    @Column(name = "download_status", nullable = false, length = 20)
    private String downloadStatus = "READY";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getReleaseId() { return releaseId; }
    public void setReleaseId(Long releaseId) { this.releaseId = releaseId; }
    public String getArtifactKind() { return artifactKind; }
    public void setArtifactKind(String artifactKind) { this.artifactKind = artifactKind; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getArch() { return arch; }
    public void setArch(String arch) { this.arch = arch; }
    public String getBundleType() { return bundleType; }
    public void setBundleType(String bundleType) { this.bundleType = bundleType; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public String getObjectKey() { return objectKey; }
    public void setObjectKey(String objectKey) { this.objectKey = objectKey; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public long getFileSize() { return fileSize; }
    public void setFileSize(long fileSize) { this.fileSize = fileSize; }
    public String getSha256() { return sha256; }
    public void setSha256(String sha256) { this.sha256 = sha256; }
    public String getSignatureText() { return signatureText; }
    public void setSignatureText(String signatureText) { this.signatureText = signatureText; }
    public String getDownloadStatus() { return downloadStatus; }
    public void setDownloadStatus(String downloadStatus) { this.downloadStatus = downloadStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
