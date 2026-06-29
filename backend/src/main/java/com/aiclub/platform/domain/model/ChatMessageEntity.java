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
 * 聊天室消息。
 * 业务意图：普通用户消息与 Hermes 助手消息统一保存在房间历史中，便于所有成员回放和继续汇总。
 */
@Entity
@Table(name = "chat_message")
public class ChatMessageEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 消息所属房间。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoomEntity room;

    /** 发送用户；Hermes 助手消息为空。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_user_id")
    private UserEntity senderUser;

    /** 消息角色：user 或 assistant。 */
    @Column(nullable = false, length = 20)
    private String role = "user";

    /** 发送用户名快照，避免用户改名影响历史可读性。 */
    @Column(name = "sender_username_snapshot", nullable = false, length = 100)
    private String senderUsernameSnapshot = "";

    /** 发送者展示名快照。 */
    @Column(name = "sender_name_snapshot", nullable = false, length = 100)
    private String senderNameSnapshot = "";

    /** 发送者头像快照。 */
    @Column(name = "sender_avatar_snapshot", nullable = false, length = 255)
    private String senderAvatarSnapshot = "";

    /** 消息正文，Markdown 文本。 */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content = "";

    /** 消息状态：DONE、STREAMING、ERROR。 */
    @Column(nullable = false, length = 20)
    private String status = "DONE";

    /** 是否在原文中提及 Hermes。 */
    @Column(name = "mentions_hermes", nullable = false)
    private boolean mentionsHermes = false;

    /** 关联的 Agent 任务；普通成员消息为空，Hermes 占位/回复消息可回指后台任务。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_task_id")
    private ChatRoomAgentTaskEntity agentTask;

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

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ChatRoomEntity getRoom() {
        return room;
    }

    public void setRoom(ChatRoomEntity room) {
        this.room = room;
    }

    public UserEntity getSenderUser() {
        return senderUser;
    }

    public void setSenderUser(UserEntity senderUser) {
        this.senderUser = senderUser;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getSenderUsernameSnapshot() {
        return senderUsernameSnapshot;
    }

    public void setSenderUsernameSnapshot(String senderUsernameSnapshot) {
        this.senderUsernameSnapshot = senderUsernameSnapshot;
    }

    public String getSenderNameSnapshot() {
        return senderNameSnapshot;
    }

    public void setSenderNameSnapshot(String senderNameSnapshot) {
        this.senderNameSnapshot = senderNameSnapshot;
    }

    public String getSenderAvatarSnapshot() {
        return senderAvatarSnapshot;
    }

    public void setSenderAvatarSnapshot(String senderAvatarSnapshot) {
        this.senderAvatarSnapshot = senderAvatarSnapshot;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public boolean isMentionsHermes() {
        return mentionsHermes;
    }

    public void setMentionsHermes(boolean mentionsHermes) {
        this.mentionsHermes = mentionsHermes;
    }

    public ChatRoomAgentTaskEntity getAgentTask() {
        return agentTask;
    }

    public void setAgentTask(ChatRoomAgentTaskEntity agentTask) {
        this.agentTask = agentTask;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
