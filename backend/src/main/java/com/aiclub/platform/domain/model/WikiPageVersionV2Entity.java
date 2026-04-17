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
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 空间化 Wiki 页面版本实体。
 */
@Entity
@Table(name = "wiki_page_version_v2")
public class WikiPageVersionV2Entity {

    /** 版本主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属页面。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "page_id", nullable = false)
    private WikiPageV2Entity page;

    /** 页面内版本号。 */
    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    /** 版本标题快照。 */
    @Column(nullable = false, length = 200)
    private String title = "";

    /** 版本正文快照。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content = "";

    /** 版本说明。 */
    @Column(name = "change_summary", nullable = false, length = 500)
    private String changeSummary = "";

    /** 版本作者。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_user_id")
    private UserEntity authorUser;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 首次保存前补齐创建时间。
     */
    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public WikiPageV2Entity getPage() {
        return page;
    }

    public void setPage(WikiPageV2Entity page) {
        this.page = page;
    }

    public int getVersionNumber() {
        return versionNumber;
    }

    public void setVersionNumber(int versionNumber) {
        this.versionNumber = versionNumber;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getChangeSummary() {
        return changeSummary;
    }

    public void setChangeSummary(String changeSummary) {
        this.changeSummary = changeSummary;
    }

    public UserEntity getAuthorUser() {
        return authorUser;
    }

    public void setAuthorUser(UserEntity authorUser) {
        this.authorUser = authorUser;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
