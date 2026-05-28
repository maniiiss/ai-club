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
 * 外部回调投递记录。
 * 该表用于做状态级幂等、防重和有限次失败重试。
 */
@Entity
@Table(name = "ai_club_pipeline_callback_delivery")
public class AiClubPipelineCallbackDeliveryEntity {

    /** 投递状态：待发送。 */
    public static final String STATUS_PENDING = "PENDING";
    /** 投递状态：发送成功。 */
    public static final String STATUS_SUCCESS = "SUCCESS";
    /** 投递状态：最终失败。 */
    public static final String STATUS_FAILED = "FAILED";

    /** 投递主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联的回调配置。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "callback_webhook_id", nullable = false)
    private AiClubPipelineCallbackWebhookEntity callbackWebhook;

    /** 关联的运行快照。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_snapshot_id", nullable = false)
    private AiClubPipelineRunSnapshotEntity runSnapshot;

    /** 当前记录对应的目标状态。 */
    @Column(name = "callback_status", nullable = false, length = 30)
    private String callbackStatus;

    /** 投递生命周期状态。 */
    @Column(name = "delivery_status", nullable = false, length = 30)
    private String deliveryStatus = STATUS_PENDING;

    /** 回调地址密文快照，避免配置更新影响历史重试。 */
    @Column(name = "callback_url_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String callbackUrlCiphertext;

    /** 回调 JSON 载荷快照。 */
    @Column(name = "payload_json", nullable = false, columnDefinition = "TEXT")
    private String payloadJson;

    /** 已尝试次数。 */
    @Column(name = "attempt_count", nullable = false)
    private Integer attemptCount = 0;

    /** 下一次允许尝试的时间。 */
    @Column(name = "next_attempt_at", nullable = false)
    private LocalDateTime nextAttemptAt;

    /** 最近一次尝试时间。 */
    @Column(name = "last_attempt_at")
    private LocalDateTime lastAttemptAt;

    /** 成功投递时间。 */
    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    /** 最近一次错误摘要。 */
    @Column(name = "last_error_message", length = 500)
    private String lastErrorMessage;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.nextAttemptAt == null) {
            this.nextAttemptAt = now;
        }
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

    public AiClubPipelineCallbackWebhookEntity getCallbackWebhook() {
        return callbackWebhook;
    }

    public void setCallbackWebhook(AiClubPipelineCallbackWebhookEntity callbackWebhook) {
        this.callbackWebhook = callbackWebhook;
    }

    public AiClubPipelineRunSnapshotEntity getRunSnapshot() {
        return runSnapshot;
    }

    public void setRunSnapshot(AiClubPipelineRunSnapshotEntity runSnapshot) {
        this.runSnapshot = runSnapshot;
    }

    public String getCallbackStatus() {
        return callbackStatus;
    }

    public void setCallbackStatus(String callbackStatus) {
        this.callbackStatus = callbackStatus;
    }

    public String getDeliveryStatus() {
        return deliveryStatus;
    }

    public void setDeliveryStatus(String deliveryStatus) {
        this.deliveryStatus = deliveryStatus;
    }

    public String getCallbackUrlCiphertext() {
        return callbackUrlCiphertext;
    }

    public void setCallbackUrlCiphertext(String callbackUrlCiphertext) {
        this.callbackUrlCiphertext = callbackUrlCiphertext;
    }

    public String getPayloadJson() {
        return payloadJson;
    }

    public void setPayloadJson(String payloadJson) {
        this.payloadJson = payloadJson;
    }

    public Integer getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(Integer attemptCount) {
        this.attemptCount = attemptCount;
    }

    public LocalDateTime getNextAttemptAt() {
        return nextAttemptAt;
    }

    public void setNextAttemptAt(LocalDateTime nextAttemptAt) {
        this.nextAttemptAt = nextAttemptAt;
    }

    public LocalDateTime getLastAttemptAt() {
        return lastAttemptAt;
    }

    public void setLastAttemptAt(LocalDateTime lastAttemptAt) {
        this.lastAttemptAt = lastAttemptAt;
    }

    public LocalDateTime getDeliveredAt() {
        return deliveredAt;
    }

    public void setDeliveredAt(LocalDateTime deliveredAt) {
        this.deliveredAt = deliveredAt;
    }

    public String getLastErrorMessage() {
        return lastErrorMessage;
    }

    public void setLastErrorMessage(String lastErrorMessage) {
        this.lastErrorMessage = lastErrorMessage;
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
