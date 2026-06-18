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
 * GitLab 自动合并外发 Webhook 配置。
 * 一条自动合并配置可挂多条 webhook，按订阅事件异步投递；
 * URL 可能携带签名 token，因此整体加密落库。
 */
@Entity
@Table(name = "gitlab_auto_merge_webhook")
public class GitlabAutoMergeWebhookEntity {

    /** 主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属自动合并配置。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "config_id", nullable = false)
    private GitlabAutoMergeConfigEntity config;

    /** 展示名称。 */
    @Column(nullable = false, length = 120)
    private String name;

    /** 投递地址密文（含可能的签名 token）。 */
    @Column(name = "target_url_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String targetUrlCiphertext;

    /** 订阅事件集合 JSON 文本，例如 ["MERGED","AI_REJECTED"]。 */
    @Column(name = "subscribed_events_json", nullable = false, columnDefinition = "TEXT")
    private String subscribedEventsJson = "[\"MERGED\",\"AI_REJECTED\",\"FAILED\"]";

    /** 自定义消息模板，留空则发送通用 JSON。 */
    @Column(name = "message_template", columnDefinition = "TEXT")
    private String messageTemplate;

    /** 是否启用。 */
    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    /** 最近一次投递时间。 */
    @Column(name = "last_delivery_at")
    private LocalDateTime lastDeliveryAt;

    /** 最近一次投递状态，例如 SUCCESS / FAILED:500 / FAILED:EX。 */
    @Column(name = "last_delivery_status", length = 60)
    private String lastDeliveryStatus;

    /** 最近一次投递的简短描述（异常摘要、HTTP body 截断等）。 */
    @Column(name = "last_delivery_message", length = 500)
    private String lastDeliveryMessage;

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

    public GitlabAutoMergeConfigEntity getConfig() {
        return config;
    }

    public void setConfig(GitlabAutoMergeConfigEntity config) {
        this.config = config;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTargetUrlCiphertext() {
        return targetUrlCiphertext;
    }

    public void setTargetUrlCiphertext(String targetUrlCiphertext) {
        this.targetUrlCiphertext = targetUrlCiphertext;
    }

    public String getSubscribedEventsJson() {
        return subscribedEventsJson;
    }

    public void setSubscribedEventsJson(String subscribedEventsJson) {
        this.subscribedEventsJson = subscribedEventsJson;
    }

    public String getMessageTemplate() {
        return messageTemplate;
    }

    public void setMessageTemplate(String messageTemplate) {
        this.messageTemplate = messageTemplate;
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

    public String getLastDeliveryMessage() {
        return lastDeliveryMessage;
    }

    public void setLastDeliveryMessage(String lastDeliveryMessage) {
        this.lastDeliveryMessage = lastDeliveryMessage;
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
