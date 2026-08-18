package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "ai_model_config")
public class AiModelConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 30)
    private String provider;

    /**
     * 模型用途类型，用于区分对话模型和 Embedding 模型，避免下游误绑到文本生成链路。
     */
    @Column(name = "model_type", nullable = false, length = 30)
    private String modelType = "CHAT";

    @Column(name = "api_base_url", nullable = false, length = 255)
    private String apiBaseUrl;

    @Column(name = "model_name", nullable = false, length = 120)
    private String modelName;

    /**
     * OpenAI 兼容模型的接口调用模式，用于跳过逐级探测并直接命中已知兼容端点。
     */
    @Column(name = "openai_api_mode", nullable = false, length = 40)
    private String openaiApiMode = "AUTO";

    /**
     * 模型上下文窗口长度（token），用于 GitPilot CLI 展示与自动压缩阈值判断；为空时 CLI 回退默认。
     */
    @Column(name = "context_length")
    private Integer contextLength;

    /**
     * 模型最大输出 token 数；为空时 CLI 回退默认。
     */
    @Column(name = "max_output_tokens")
    private Integer maxOutputTokens;

    /**
     * 模型支持的输入模态，使用逗号分隔的 text/image 保存；平台配置是桌面端多模态能力的唯一来源。
     */
    @Column(name = "input_modalities", nullable = false, length = 32)
    private String inputModalities = "text";

    /**
     * 每千输入 token 积分单价，启用 token 计费时把输入 token 换算为积分。
     */
    @Column(name = "input_credit_per_1k", precision = 10, scale = 4)
    private BigDecimal inputCreditPer1k;

    /**
     * 每千输出 token 积分单价。
     */
    @Column(name = "output_credit_per_1k", precision = 10, scale = 4)
    private BigDecimal outputCreditPer1k;

    /**
     * 每千缓存命中输入 token 单价；为空时按 inputCreditPer1k × 0.5 兜底（折扣计费）。
     */
    @Column(name = "cached_input_credit_per_1k", precision = 10, scale = 4)
    private BigDecimal cachedInputCreditPer1k;

    /**
     * 是否对该模型启用 token 计费（灰度开关），关闭时智能体执行不按 token 扣费。
     */
    @Column(name = "token_billing_enabled", nullable = false)
    private Boolean tokenBillingEnabled = Boolean.FALSE;

    /**
     * 模型相对平台 1x 基准价的计费倍率；为空或未启用计费时，桌面端按 free 展示。
     */
    @Column(name = "billing_multiplier", precision = 10, scale = 4)
    private BigDecimal billingMultiplier;

    @Column(name = "api_key_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String apiKeyCiphertext;

    @Column(nullable = false, length = 500)
    private String description = "";

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public String getModelType() {
        return modelType;
    }

    public void setModelType(String modelType) {
        this.modelType = modelType;
    }

    public void setApiBaseUrl(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getOpenaiApiMode() {
        return openaiApiMode;
    }

    public void setOpenaiApiMode(String openaiApiMode) {
        this.openaiApiMode = openaiApiMode;
    }

    public Integer getContextLength() {
        return contextLength;
    }

    public void setContextLength(Integer contextLength) {
        this.contextLength = contextLength;
    }

    public Integer getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public void setMaxOutputTokens(Integer maxOutputTokens) {
        this.maxOutputTokens = maxOutputTokens;
    }

    public String getInputModalities() {
        return inputModalities;
    }

    public void setInputModalities(String inputModalities) {
        this.inputModalities = inputModalities;
    }

    public BigDecimal getInputCreditPer1k() {
        return inputCreditPer1k;
    }

    public void setInputCreditPer1k(BigDecimal inputCreditPer1k) {
        this.inputCreditPer1k = inputCreditPer1k;
    }

    public BigDecimal getOutputCreditPer1k() {
        return outputCreditPer1k;
    }

    public void setOutputCreditPer1k(BigDecimal outputCreditPer1k) {
        this.outputCreditPer1k = outputCreditPer1k;
    }

    public BigDecimal getCachedInputCreditPer1k() {
        return cachedInputCreditPer1k;
    }

    public void setCachedInputCreditPer1k(BigDecimal cachedInputCreditPer1k) {
        this.cachedInputCreditPer1k = cachedInputCreditPer1k;
    }

    public Boolean getTokenBillingEnabled() {
        return tokenBillingEnabled;
    }

    public void setTokenBillingEnabled(Boolean tokenBillingEnabled) {
        this.tokenBillingEnabled = tokenBillingEnabled;
    }

    public BigDecimal getBillingMultiplier() {
        return billingMultiplier;
    }

    public void setBillingMultiplier(BigDecimal billingMultiplier) {
        this.billingMultiplier = billingMultiplier;
    }

    public String getApiKeyCiphertext() {
        return apiKeyCiphertext;
    }

    public void setApiKeyCiphertext(String apiKeyCiphertext) {
        this.apiKeyCiphertext = apiKeyCiphertext;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
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
