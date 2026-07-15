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
 * GitPilot 反馈处理活动记录。
 * 业务意图：让运营状态、负责人和数据集标记的每次变化都可追溯。
 */
@Entity
@Table(name = "assistant_feedback_activity")
public class AssistantFeedbackActivityEntity {
    /** 活动主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    /** 反馈 ID。 */
    @Column(name = "feedback_id", nullable = false)
    private Long feedbackId;
    /** 活动类型。 */
    @Column(name = "action_type", nullable = false, length = 40)
    private String actionType = "";
    /** 变更前状态。 */
    @Column(name = "from_status", length = 20)
    private String fromStatus;
    /** 变更后状态。 */
    @Column(name = "to_status", length = 20)
    private String toStatus;
    /** 活动说明。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String note = "";
    /** 操作人。 */
    @Column(name = "actor_user_id")
    private Long actorUserId;
    /** 活动时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 首次入库时补充活动时间。 */
    @PrePersist
    public void prePersist() { if (createdAt == null) createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFeedbackId() { return feedbackId; }
    public void setFeedbackId(Long feedbackId) { this.feedbackId = feedbackId; }
    public String getActionType() { return actionType; }
    public void setActionType(String actionType) { this.actionType = actionType; }
    public String getFromStatus() { return fromStatus; }
    public void setFromStatus(String fromStatus) { this.fromStatus = fromStatus; }
    public String getToStatus() { return toStatus; }
    public void setToStatus(String toStatus) { this.toStatus = toStatus; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Long getActorUserId() { return actorUserId; }
    public void setActorUserId(Long actorUserId) { this.actorUserId = actorUserId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
