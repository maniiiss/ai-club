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
 * 平台版本发布记录。
 * 业务意图：保存管理员正式发布的不可变版本说明，供公众端按用户状态展示。
 */
@Entity
@Table(name = "platform_release")
public class PlatformReleaseEntity {

    /** 版本发布记录主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 管理员填写的业务版本号，例如 1.4.0。 */
    @Column(name = "version_code", nullable = false, unique = true, length = 50)
    private String versionCode;

    /** 发布标题。 */
    @Column(nullable = false, length = 200)
    private String title;

    /** Markdown 格式的版本发布内容。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** 发布人用户 ID，保留快照关联便于审计。 */
    @Column(name = "publisher_user_id", nullable = false)
    private Long publisherUserId;

    /** 正式发布时间。 */
    @Column(name = "published_at", nullable = false)
    private LocalDateTime publishedAt;

    /** 首次入库时补齐发布时间。 */
    @PrePersist
    public void prePersist() {
        if (publishedAt == null) {
            publishedAt = LocalDateTime.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getVersionCode() { return versionCode; }
    public void setVersionCode(String versionCode) { this.versionCode = versionCode; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Long getPublisherUserId() { return publisherUserId; }
    public void setPublisherUserId(Long publisherUserId) { this.publisherUserId = publisherUserId; }
    public LocalDateTime getPublishedAt() { return publishedAt; }
    public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
}
