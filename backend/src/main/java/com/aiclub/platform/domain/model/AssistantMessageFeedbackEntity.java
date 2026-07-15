package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * GitPilot 针对单条助手回答的用户反馈记录。
 * 业务意图：保存评价发生时的问答快照，让后续运营处理和复盘不依赖可变的在线会话内容。
 */
@Entity
@Table(name = "assistant_message_feedback")
public class AssistantMessageFeedbackEntity {

    /** 反馈主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    /** 反馈归属会话 ID。 */
    @Column(name = "session_id", nullable = false)
    private Long sessionId;
    /** 触发本次回答的用户消息 ID。 */
    @Column(name = "user_message_id")
    private Long userMessageId;
    /** 被评价的助手消息 ID。 */
    @Column(name = "assistant_message_id", nullable = false)
    private Long assistantMessageId;
    /** 提交用户 ID。 */
    @Column(name = "submitter_user_id", nullable = false)
    private Long submitterUserId;
    /** 提交时用户名快照。 */
    @Column(name = "submitter_username", nullable = false, length = 100)
    private String submitterUsername = "";
    /** 提交时昵称快照。 */
    @Column(name = "submitter_nickname", nullable = false, length = 100)
    private String submitterNickname = "";
    /** 评价方向：UP 或 DOWN。 */
    @Column(nullable = false, length = 10)
    private String vote = "DOWN";
    /** 负面原因编码 JSON 数组。 */
    @Column(name = "reason_codes_json", nullable = false, columnDefinition = "TEXT")
    private String reasonCodesJson = "[]";
    /** 用户补充说明。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String comment = "";
    /** 用户问题快照。 */
    @Column(name = "question_snapshot", nullable = false, columnDefinition = "TEXT")
    private String questionSnapshot = "";
    /** 助手回答快照。 */
    @Column(name = "answer_snapshot", nullable = false, columnDefinition = "TEXT")
    private String answerSnapshot = "";
    /** 回答使用的 Runtime 快照。 */
    @Column(name = "runtime_registry_code", nullable = false, length = 40)
    private String runtimeRegistryCode = "";
    /** 会话创建时绑定的路由名称。 */
    @Column(name = "route_name", nullable = false, length = 80)
    private String routeName = "";
    /** 会话绑定的项目 ID。 */
    @Column(name = "project_id")
    private Long projectId;
    /** 运营处理状态。 */
    @Column(nullable = false, length = 20)
    private String status = "NEW";
    /** 当前负责人用户 ID。 */
    @Column(name = "assignee_user_id")
    private Long assigneeUserId;
    /** 运营处理结论编码。 */
    @Column(name = "resolution_code", length = 40)
    private String resolutionCode;
    /** 运营处理说明。 */
    @Column(name = "resolution_note", nullable = false, columnDefinition = "TEXT")
    private String resolutionNote = "";
    /** 改进标签 JSON 数组。 */
    @Column(name = "improvement_tags_json", nullable = false, columnDefinition = "TEXT")
    private String improvementTagsJson = "[]";
    /** 是否纳入复盘数据集。 */
    @Column(name = "dataset_status", nullable = false, length = 20)
    private String datasetStatus = "PENDING";
    /** 进入终态的时间。 */
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /** 首次入库时补充时间。 */
    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    /** 更新记录时刷新更新时间。 */
    @PreUpdate
    public void preUpdate() { updatedAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Long getUserMessageId() { return userMessageId; }
    public void setUserMessageId(Long userMessageId) { this.userMessageId = userMessageId; }
    public Long getAssistantMessageId() { return assistantMessageId; }
    public void setAssistantMessageId(Long assistantMessageId) { this.assistantMessageId = assistantMessageId; }
    public Long getSubmitterUserId() { return submitterUserId; }
    public void setSubmitterUserId(Long submitterUserId) { this.submitterUserId = submitterUserId; }
    public String getSubmitterUsername() { return submitterUsername; }
    public void setSubmitterUsername(String submitterUsername) { this.submitterUsername = submitterUsername; }
    public String getSubmitterNickname() { return submitterNickname; }
    public void setSubmitterNickname(String submitterNickname) { this.submitterNickname = submitterNickname; }
    public String getVote() { return vote; }
    public void setVote(String vote) { this.vote = vote; }
    public String getReasonCodesJson() { return reasonCodesJson; }
    public void setReasonCodesJson(String reasonCodesJson) { this.reasonCodesJson = reasonCodesJson; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getQuestionSnapshot() { return questionSnapshot; }
    public void setQuestionSnapshot(String questionSnapshot) { this.questionSnapshot = questionSnapshot; }
    public String getAnswerSnapshot() { return answerSnapshot; }
    public void setAnswerSnapshot(String answerSnapshot) { this.answerSnapshot = answerSnapshot; }
    public String getRuntimeRegistryCode() { return runtimeRegistryCode; }
    public void setRuntimeRegistryCode(String runtimeRegistryCode) { this.runtimeRegistryCode = runtimeRegistryCode; }
    public String getRouteName() { return routeName; }
    public void setRouteName(String routeName) { this.routeName = routeName; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getAssigneeUserId() { return assigneeUserId; }
    public void setAssigneeUserId(Long assigneeUserId) { this.assigneeUserId = assigneeUserId; }
    public String getResolutionCode() { return resolutionCode; }
    public void setResolutionCode(String resolutionCode) { this.resolutionCode = resolutionCode; }
    public String getResolutionNote() { return resolutionNote; }
    public void setResolutionNote(String resolutionNote) { this.resolutionNote = resolutionNote; }
    public String getImprovementTagsJson() { return improvementTagsJson; }
    public void setImprovementTagsJson(String improvementTagsJson) { this.improvementTagsJson = improvementTagsJson; }
    public String getDatasetStatus() { return datasetStatus; }
    public void setDatasetStatus(String datasetStatus) { this.datasetStatus = datasetStatus; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(LocalDateTime resolvedAt) { this.resolvedAt = resolvedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
