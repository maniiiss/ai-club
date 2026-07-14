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
 * Assistant 用户消息关联的文档附件，保存原始文档资产与本次转换后的 Markdown。
 */
@Entity
@Table(name = "hermes_conversation_attachment")
public class AssistantConversationAttachmentEntity {

    /** 附件主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 附件归属的用户消息。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "message_id", nullable = false)
    private AssistantConversationMessageEntity message;

    /** 原始文件对应的平台文档资产。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_asset_id", nullable = false)
    private DocumentAssetEntity documentAsset;

    /** MarkItDown 建议的标题，用于前端回显。 */
    @Column(name = "suggested_title", nullable = false, length = 200)
    private String suggestedTitle = "";

    /** 本次转换后的 Markdown 文本。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String markdown = "";

    /** 转换结果是否因为长度限制被截断。 */
    @Column(nullable = false)
    private boolean truncated;

    /** 转换警告 JSON 数组文本。 */
    @Column(name = "warnings_json", nullable = false, columnDefinition = "TEXT")
    private String warningsJson = "[]";

    /** 附件记录创建时间。 */
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

    public AssistantConversationMessageEntity getMessage() {
        return message;
    }

    public void setMessage(AssistantConversationMessageEntity message) {
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
