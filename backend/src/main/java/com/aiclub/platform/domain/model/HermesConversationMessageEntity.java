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
 * Hermes 会话中的单条可回显消息记录。
 */
@Entity
@Table(name = "hermes_conversation_message")
public class HermesConversationMessageEntity {

    /** 消息主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 当前消息归属的会话。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private HermesConversationSessionEntity session;

    /** 消息角色，例如 user 或 assistant。 */
    @Column(nullable = false, length = 20)
    private String role = "";

    /** 消息正文内容。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content = "";

    /** 前端回显状态，例如 DONE 或 ERROR。 */
    @Column(nullable = false, length = 20)
    private String status = "DONE";

    /** 消息创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 首次入库前补齐默认创建时间。
     */
    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    /**
     * 获取消息主键ID。
     */
    public Long getId() {
        return id;
    }

    /**
     * 设置消息主键ID。
     */
    public void setId(Long id) {
        this.id = id;
    }

    /**
     * 获取归属会话。
     */
    public HermesConversationSessionEntity getSession() {
        return session;
    }

    /**
     * 设置归属会话。
     */
    public void setSession(HermesConversationSessionEntity session) {
        this.session = session;
    }

    /**
     * 获取消息角色。
     */
    public String getRole() {
        return role;
    }

    /**
     * 设置消息角色。
     */
    public void setRole(String role) {
        this.role = role;
    }

    /**
     * 获取消息正文内容。
     */
    public String getContent() {
        return content;
    }

    /**
     * 设置消息正文内容。
     */
    public void setContent(String content) {
        this.content = content;
    }

    /**
     * 获取消息回显状态。
     */
    public String getStatus() {
        return status;
    }

    /**
     * 设置消息回显状态。
     */
    public void setStatus(String status) {
        this.status = status;
    }

    /**
     * 获取消息创建时间。
     */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /**
     * 设置消息创建时间。
     */
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
