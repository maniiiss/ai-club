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
 * AI Club Pipeline 的公开触发 webhook 配置。
 * token 只保存密文，避免公开地址被数据库明文泄漏。
 */
@Entity
@Table(name = "ai_club_pipeline_trigger_webhook")
public class AiClubPipelineTriggerWebhookEntity {

    /** 配置主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属流水线。 */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private AiClubPipelineEntity pipeline;

    /** 公开触发 token 的密文。 */
    @Column(name = "token_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String tokenCiphertext;

    /** 是否允许匿名 webhook 触发。 */
    @Column(nullable = false)
    private Boolean enabled = Boolean.FALSE;

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

    public String getTokenCiphertext() {
        return tokenCiphertext;
    }

    public void setTokenCiphertext(String tokenCiphertext) {
        this.tokenCiphertext = tokenCiphertext;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
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
