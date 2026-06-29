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
 * 聊天室消息附件。
 * 业务意图：附件原文件复用 document_asset，额外保存本次转换 Markdown，供 @Hermes 汇总时引用。
 */
@Entity
@Table(name = "chat_message_attachment")
public class ChatMessageAttachmentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", nullable = false)
    private ChatMessageEntity message;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_asset_id", nullable = false)
    private DocumentAssetEntity documentAsset;

    @Column(name = "suggested_title", nullable = false, length = 200)
    private String suggestedTitle = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String markdown = "";

    @Column(nullable = false)
    private boolean truncated;

    @Column(name = "warnings_json", nullable = false, columnDefinition = "TEXT")
    private String warningsJson = "[]";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

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

    public ChatMessageEntity getMessage() {
        return message;
    }

    public void setMessage(ChatMessageEntity message) {
        this.message = message;
    }

    public DocumentAssetEntity getDocumentAsset() {
        return documentAsset;
    }

    public void setDocumentAsset(DocumentAssetEntity documentAsset) {
        this.documentAsset = documentAsset;
    }

    public String getSuggestedTitle() {
        return suggestedTitle;
    }

    public void setSuggestedTitle(String suggestedTitle) {
        this.suggestedTitle = suggestedTitle;
    }

    public String getMarkdown() {
        return markdown;
    }

    public void setMarkdown(String markdown) {
        this.markdown = markdown;
    }

    public boolean isTruncated() {
        return truncated;
    }

    public void setTruncated(boolean truncated) {
        this.truncated = truncated;
    }

    public String getWarningsJson() {
        return warningsJson;
    }

    public void setWarningsJson(String warningsJson) {
        this.warningsJson = warningsJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
