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
 * 服务器告警状态实体。
 * 每台服务器按告警类型维护一条状态，便于做连续越线计数、冷却控制和恢复通知。
 */
@Entity
@Table(name = "server_alert_state")
public class ServerAlertStateEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "server_id", nullable = false)
    private ServerInfoEntity server;

    @Column(name = "alert_code", nullable = false, length = 30)
    private String alertCode;

    @Column(name = "alert_name", nullable = false, length = 60)
    private String alertName;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "last_observed_value")
    private Integer lastObservedValue;

    @Column(name = "consecutive_breach_count", nullable = false)
    private Integer consecutiveBreachCount = 0;

    @Column(name = "last_notified_at")
    private LocalDateTime lastNotifiedAt;

    @Column(name = "last_triggered_at")
    private LocalDateTime lastTriggeredAt;

    @Column(name = "last_recovered_at")
    private LocalDateTime lastRecoveredAt;

    @Column(name = "last_message", length = 500)
    private String lastMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ServerInfoEntity getServer() {
        return server;
    }

    public void setServer(ServerInfoEntity server) {
        this.server = server;
    }

    public String getAlertCode() {
        return alertCode;
    }

    public void setAlertCode(String alertCode) {
        this.alertCode = alertCode;
    }

    public String getAlertName() {
        return alertName;
    }

    public void setAlertName(String alertName) {
        this.alertName = alertName;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Integer getLastObservedValue() {
        return lastObservedValue;
    }

    public void setLastObservedValue(Integer lastObservedValue) {
        this.lastObservedValue = lastObservedValue;
    }

    public Integer getConsecutiveBreachCount() {
        return consecutiveBreachCount;
    }

    public void setConsecutiveBreachCount(Integer consecutiveBreachCount) {
        this.consecutiveBreachCount = consecutiveBreachCount;
    }

    public LocalDateTime getLastNotifiedAt() {
        return lastNotifiedAt;
    }

    public void setLastNotifiedAt(LocalDateTime lastNotifiedAt) {
        this.lastNotifiedAt = lastNotifiedAt;
    }

    public LocalDateTime getLastTriggeredAt() {
        return lastTriggeredAt;
    }

    public void setLastTriggeredAt(LocalDateTime lastTriggeredAt) {
        this.lastTriggeredAt = lastTriggeredAt;
    }

    public LocalDateTime getLastRecoveredAt() {
        return lastRecoveredAt;
    }

    public void setLastRecoveredAt(LocalDateTime lastRecoveredAt) {
        this.lastRecoveredAt = lastRecoveredAt;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public void setLastMessage(String lastMessage) {
        this.lastMessage = lastMessage;
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
