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
 * 聊天室 Agent 后台任务。
 * 业务意图：把 @Assistant、主动总结和状态回写都持久化，支持重启恢复、进度展示和审计追踪。
 */
@Entity
@Table(name = "chat_room_agent_task")
public class ChatRoomAgentTaskEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoomEntity room;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assistant_message_id")
    private ChatMessageEntity assistantMessage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trigger_message_id")
    private ChatMessageEntity triggerMessage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trigger_user_id")
    private UserEntity triggerUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "authorized_by_user_id")
    private UserEntity authorizedByUser;

    @Column(name = "trigger_type", nullable = false, length = 30)
    private String triggerType = "MENTION";

    @Column(nullable = false, length = 30)
    private String status = "PENDING";

    @Column(nullable = false, length = 100)
    private String source = "";

    /**
     * 触发源幂等键。
     * 业务意图：同一消息关键字命中、同一执行任务状态、同一总结窗口只能创建一个 Agent 任务。
     */
    @Column(name = "source_ref", nullable = false, length = 200)
    private String sourceRef = "";

    /**
     * 任务触发上下文 JSON。
     * 业务意图：RabbitMQ 只传 taskId，真实执行上下文保存在数据库中，便于重试和审计。
     */
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson = "{}";

    @Column(name = "error_message", nullable = false, columnDefinition = "TEXT")
    private String errorMessage = "";

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

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

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ChatRoomEntity getRoom() { return room; }
    public void setRoom(ChatRoomEntity room) { this.room = room; }
    public ChatMessageEntity getAssistantMessage() { return assistantMessage; }
    public void setAssistantMessage(ChatMessageEntity assistantMessage) { this.assistantMessage = assistantMessage; }
    public ChatMessageEntity getTriggerMessage() { return triggerMessage; }
    public void setTriggerMessage(ChatMessageEntity triggerMessage) { this.triggerMessage = triggerMessage; }
    public UserEntity getTriggerUser() { return triggerUser; }
    public void setTriggerUser(UserEntity triggerUser) { this.triggerUser = triggerUser; }
    public UserEntity getAuthorizedByUser() { return authorizedByUser; }
    public void setAuthorizedByUser(UserEntity authorizedByUser) { this.authorizedByUser = authorizedByUser; }
    public String getTriggerType() { return triggerType; }
    public void setTriggerType(String triggerType) { this.triggerType = triggerType; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getSourceRef() { return sourceRef; }
    public void setSourceRef(String sourceRef) { this.sourceRef = sourceRef; }
    public String getPayloadJson() { return payloadJson; }
    public void setPayloadJson(String payloadJson) { this.payloadJson = payloadJson; }
    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
    public LocalDateTime getFinishedAt() { return finishedAt; }
    public void setFinishedAt(LocalDateTime finishedAt) { this.finishedAt = finishedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
