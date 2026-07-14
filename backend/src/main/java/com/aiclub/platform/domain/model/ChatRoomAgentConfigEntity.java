package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 聊天室房间级 Hermes Agent 配置。
 * 业务意图：让每个房间拥有独立的 AI 同事身份、主动能力开关和授权快照。
 */
@Entity
@Table(name = "chat_room_agent_config")
public class ChatRoomAgentConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false, unique = true)
    private ChatRoomEntity room;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName = "GitPilot";

    /** 房间 Agent 绑定的 Runtime 注册编码；创建任务时会复制到任务快照。 */
    @Column(name = "runtime_registry_code", nullable = false, length = 40)
    private String runtimeRegistryCode = "HERMES_LEGACY";

    @Column(name = "system_instruction", nullable = false, columnDefinition = "TEXT")
    private String systemInstruction = "";

    @Column(name = "proactive_summary_enabled", nullable = false)
    private boolean proactiveSummaryEnabled = false;

    @Column(name = "keyword_watch_enabled", nullable = false)
    private boolean keywordWatchEnabled = false;

    @Column(name = "task_status_callback_enabled", nullable = false)
    private boolean taskStatusCallbackEnabled = false;

    /** 主动总结触发阈值：上次总结后新增消息达到该数量才创建总结任务。 */
    @Column(name = "proactive_summary_message_threshold", nullable = false)
    private int proactiveSummaryMessageThreshold = 20;

    /** 主动总结最小间隔，避免高频房间不断产生总结任务。 */
    @Column(name = "proactive_summary_min_interval_minutes", nullable = false)
    private int proactiveSummaryMinIntervalMinutes = 60;

    /** 关键字监听词表 JSON，使用数组保存房主配置的触发词。 */
    @Column(name = "keyword_watch_terms_json", nullable = false, columnDefinition = "TEXT")
    private String keywordWatchTermsJson = "[]";

    /** 关键字监听冷却时间，避免同一房间短时间内刷屏。 */
    @Column(name = "keyword_watch_cooldown_minutes", nullable = false)
    private int keywordWatchCooldownMinutes = 10;

    /** 执行任务状态回写订阅状态 JSON。 */
    @Column(name = "task_status_callback_statuses_json", nullable = false, columnDefinition = "TEXT")
    private String taskStatusCallbackStatusesJson = "[\"SUCCESS\",\"FAILED\",\"CANCELED\"]";

    /** 上次主动总结覆盖到的消息 ID。 */
    @Column(name = "last_summary_message_id")
    private Long lastSummaryMessageId;

    /** 上次主动总结时间。 */
    @Column(name = "last_summary_at")
    private LocalDateTime lastSummaryAt;

    /** 上次关键字触发时间。 */
    @Column(name = "keyword_last_triggered_at")
    private LocalDateTime keywordLastTriggeredAt;

    /** 执行任务状态回写上次扫描时间。 */
    @Column(name = "task_status_last_checked_at")
    private LocalDateTime taskStatusLastCheckedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "authorized_by_user_id")
    private UserEntity authorizedByUser;

    @Column(name = "authorized_at")
    private LocalDateTime authorizedAt;

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
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getRuntimeRegistryCode() { return runtimeRegistryCode; }
    public void setRuntimeRegistryCode(String runtimeRegistryCode) { this.runtimeRegistryCode = runtimeRegistryCode; }
    public String getSystemInstruction() { return systemInstruction; }
    public void setSystemInstruction(String systemInstruction) { this.systemInstruction = systemInstruction; }
    public boolean isProactiveSummaryEnabled() { return proactiveSummaryEnabled; }
    public void setProactiveSummaryEnabled(boolean proactiveSummaryEnabled) { this.proactiveSummaryEnabled = proactiveSummaryEnabled; }
    public boolean isKeywordWatchEnabled() { return keywordWatchEnabled; }
    public void setKeywordWatchEnabled(boolean keywordWatchEnabled) { this.keywordWatchEnabled = keywordWatchEnabled; }
    public boolean isTaskStatusCallbackEnabled() { return taskStatusCallbackEnabled; }
    public void setTaskStatusCallbackEnabled(boolean taskStatusCallbackEnabled) { this.taskStatusCallbackEnabled = taskStatusCallbackEnabled; }
    public int getProactiveSummaryMessageThreshold() { return proactiveSummaryMessageThreshold; }
    public void setProactiveSummaryMessageThreshold(int proactiveSummaryMessageThreshold) { this.proactiveSummaryMessageThreshold = proactiveSummaryMessageThreshold; }
    public int getProactiveSummaryMinIntervalMinutes() { return proactiveSummaryMinIntervalMinutes; }
    public void setProactiveSummaryMinIntervalMinutes(int proactiveSummaryMinIntervalMinutes) { this.proactiveSummaryMinIntervalMinutes = proactiveSummaryMinIntervalMinutes; }
    public String getKeywordWatchTermsJson() { return keywordWatchTermsJson; }
    public void setKeywordWatchTermsJson(String keywordWatchTermsJson) { this.keywordWatchTermsJson = keywordWatchTermsJson; }
    public int getKeywordWatchCooldownMinutes() { return keywordWatchCooldownMinutes; }
    public void setKeywordWatchCooldownMinutes(int keywordWatchCooldownMinutes) { this.keywordWatchCooldownMinutes = keywordWatchCooldownMinutes; }
    public String getTaskStatusCallbackStatusesJson() { return taskStatusCallbackStatusesJson; }
    public void setTaskStatusCallbackStatusesJson(String taskStatusCallbackStatusesJson) { this.taskStatusCallbackStatusesJson = taskStatusCallbackStatusesJson; }
    public Long getLastSummaryMessageId() { return lastSummaryMessageId; }
    public void setLastSummaryMessageId(Long lastSummaryMessageId) { this.lastSummaryMessageId = lastSummaryMessageId; }
    public LocalDateTime getLastSummaryAt() { return lastSummaryAt; }
    public void setLastSummaryAt(LocalDateTime lastSummaryAt) { this.lastSummaryAt = lastSummaryAt; }
    public LocalDateTime getKeywordLastTriggeredAt() { return keywordLastTriggeredAt; }
    public void setKeywordLastTriggeredAt(LocalDateTime keywordLastTriggeredAt) { this.keywordLastTriggeredAt = keywordLastTriggeredAt; }
    public LocalDateTime getTaskStatusLastCheckedAt() { return taskStatusLastCheckedAt; }
    public void setTaskStatusLastCheckedAt(LocalDateTime taskStatusLastCheckedAt) { this.taskStatusLastCheckedAt = taskStatusLastCheckedAt; }
    public UserEntity getAuthorizedByUser() { return authorizedByUser; }
    public void setAuthorizedByUser(UserEntity authorizedByUser) { this.authorizedByUser = authorizedByUser; }
    public LocalDateTime getAuthorizedAt() { return authorizedAt; }
    public void setAuthorizedAt(LocalDateTime authorizedAt) { this.authorizedAt = authorizedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
