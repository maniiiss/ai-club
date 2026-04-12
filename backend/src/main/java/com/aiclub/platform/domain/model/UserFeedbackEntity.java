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
 * 用户提交的反馈与建议记录。
 */
@Entity
@Table(name = "user_feedback")
public class UserFeedbackEntity {

    /** 反馈主键ID。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 反馈类型，例如 BUG、SUGGESTION。 */
    @Column(name = "feedback_type", nullable = false, length = 20)
    private String feedbackType;

    /** 反馈标题，便于后续检索和定位。 */
    @Column(nullable = false, length = 100)
    private String title;

    /** 反馈正文内容。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** 提交反馈的用户ID快照。 */
    @Column(name = "submitter_user_id", nullable = false)
    private Long submitterUserId;

    /** 提交反馈时的用户名快照。 */
    @Column(name = "submitter_username", nullable = false, length = 50)
    private String submitterUsername;

    /** 提交反馈时的用户昵称快照。 */
    @Column(name = "submitter_nickname", nullable = false, length = 100)
    private String submitterNickname;

    /** 反馈创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 在实体首次入库前补齐默认创建时间，避免控制层或服务层重复赋值。
     */
    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    /**
     * 获取反馈主键ID。
     */
    public Long getId() {
        return id;
    }

    /**
     * 设置反馈主键ID。
     */
    public void setId(Long id) {
        this.id = id;
    }

    /**
     * 获取反馈类型。
     */
    public String getFeedbackType() {
        return feedbackType;
    }

    /**
     * 设置反馈类型。
     */
    public void setFeedbackType(String feedbackType) {
        this.feedbackType = feedbackType;
    }

    /**
     * 获取反馈标题。
     */
    public String getTitle() {
        return title;
    }

    /**
     * 设置反馈标题。
     */
    public void setTitle(String title) {
        this.title = title;
    }

    /**
     * 获取反馈内容。
     */
    public String getContent() {
        return content;
    }

    /**
     * 设置反馈内容。
     */
    public void setContent(String content) {
        this.content = content;
    }

    /**
     * 获取提交用户ID。
     */
    public Long getSubmitterUserId() {
        return submitterUserId;
    }

    /**
     * 设置提交用户ID。
     */
    public void setSubmitterUserId(Long submitterUserId) {
        this.submitterUserId = submitterUserId;
    }

    /**
     * 获取提交用户名快照。
     */
    public String getSubmitterUsername() {
        return submitterUsername;
    }

    /**
     * 设置提交用户名快照。
     */
    public void setSubmitterUsername(String submitterUsername) {
        this.submitterUsername = submitterUsername;
    }

    /**
     * 获取提交昵称快照。
     */
    public String getSubmitterNickname() {
        return submitterNickname;
    }

    /**
     * 设置提交昵称快照。
     */
    public void setSubmitterNickname(String submitterNickname) {
        this.submitterNickname = submitterNickname;
    }

    /**
     * 获取反馈创建时间。
     */
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    /**
     * 设置反馈创建时间。
     */
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
