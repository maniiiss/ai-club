package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * AI Club Pipeline 的外部回调 webhook 配置。
 * URL 可能带 query token，因此按密文整体存储。
 */
@Entity
@Table(name = "ai_club_pipeline_callback_webhook")
public class AiClubPipelineCallbackWebhookEntity {

    /** 配置主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属流水线。 */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private AiClubPipelineEntity pipeline;

    /** 回调地址密文。 */
    @Column(name = "callback_url_ciphertext", columnDefinition = "TEXT")
    private String callbackUrlCiphertext;

    /** 订阅状态集合的 JSON 文本。 */
    @Column(name = "subscribed_statuses_json", nullable = false, columnDefinition = "TEXT")
    private String subscribedStatusesJson = "[\"SUCCESS\",\"FAILED\",\"CANCELED\"]";

    /** 是否启用外部回调。 */
    @Column(nullable = false)
    private Boolean enabled = Boolean.FALSE;

    /** 最近一次投递时间。 */
    @Column(name = "last_delivery_at")
    private LocalDateTime lastDeliveryAt;

    /** 最近一次投递状态。 */
    @Column(name = "last_delivery_status", length = 30)
    private String lastDeliveryStatus;

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

    public AiClubPipelineEntity getPipeline() {
        return pipeline;
    }

    public void setPipeline(AiClubPipelineEntity pipeline) {
        this.pipeline = pipeline;
    }

    public String getCallbackUrlCiphertext() {
        return callbackUrlCiphertext;
    }

    public void setCallbackUrlCiphertext(String callbackUrlCiphertext) {
        this.callbackUrlCiphertext = callbackUrlCiphertext;
    }

    public String getSubscribedStatusesJson() {
        return subscribedStatusesJson;
    }

    public void setSubscribedStatusesJson(String subscribedStatusesJson) {
        this.subscribedStatusesJson = subscribedStatusesJson;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public LocalDateTime getLastDeliveryAt() {
        return lastDeliveryAt;
    }

    public void setLastDeliveryAt(LocalDateTime lastDeliveryAt) {
        this.lastDeliveryAt = lastDeliveryAt;
    }

    public String getLastDeliveryStatus() {
        return lastDeliveryStatus;
    }

    public void setLastDeliveryStatus(String lastDeliveryStatus) {
        this.lastDeliveryStatus = lastDeliveryStatus;
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
