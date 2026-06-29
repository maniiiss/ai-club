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
 * 聊天室 Agent 工具授权策略。
 * 业务意图：房主按房间授权工具，自动执行能力必须有显式策略记录和风险快照。
 */
@Entity
@Table(name = "chat_room_agent_tool_policy")
public class ChatRoomAgentToolPolicyEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoomEntity room;

    @Column(name = "tool_code", nullable = false, length = 100)
    private String toolCode = "";

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "auto_execute", nullable = false)
    private boolean autoExecute = false;

    @Column(name = "read_only_snapshot", nullable = false)
    private boolean readOnlySnapshot = true;

    @Column(name = "risk_level_snapshot", nullable = false, length = 30)
    private String riskLevelSnapshot = "LOW";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by_user_id")
    private UserEntity updatedByUser;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public ChatRoomEntity getRoom() { return room; }
    public void setRoom(ChatRoomEntity room) { this.room = room; }
    public String getToolCode() { return toolCode; }
    public void setToolCode(String toolCode) { this.toolCode = toolCode; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isAutoExecute() { return autoExecute; }
    public void setAutoExecute(boolean autoExecute) { this.autoExecute = autoExecute; }
    public boolean isReadOnlySnapshot() { return readOnlySnapshot; }
    public void setReadOnlySnapshot(boolean readOnlySnapshot) { this.readOnlySnapshot = readOnlySnapshot; }
    public String getRiskLevelSnapshot() { return riskLevelSnapshot; }
    public void setRiskLevelSnapshot(String riskLevelSnapshot) { this.riskLevelSnapshot = riskLevelSnapshot; }
    public UserEntity getUpdatedByUser() { return updatedByUser; }
    public void setUpdatedByUser(UserEntity updatedByUser) { this.updatedByUser = updatedByUser; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
