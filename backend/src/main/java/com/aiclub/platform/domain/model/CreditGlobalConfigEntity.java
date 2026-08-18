package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 积分全局配置，当前用于控制公众端新用户注册赠送积分的业务口径。
 */
@Entity
@Table(name = "credit_global_config")
public class CreditGlobalConfigEntity {

    @Id
    private Long id = 1L;

    @Column(name = "register_grant_amount", nullable = false)
    private int registerGrantAmount = 0;

    @Column(name = "register_grant_enabled", nullable = false)
    private boolean registerGrantEnabled = true;

    /** 平台统一的模型 1x 输入 token 单价，模型实际价格由倍率换算得到。 */
    @Column(name = "model_base_input_credit_per_1k", nullable = false, precision = 10, scale = 4)
    private BigDecimal modelBaseInputCreditPer1k = new BigDecimal("0.0200");

    /** 平台统一的模型 1x 输出 token 单价，模型实际价格由倍率换算得到。 */
    @Column(name = "model_base_output_credit_per_1k", nullable = false, precision = 10, scale = 4)
    private BigDecimal modelBaseOutputCreditPer1k = new BigDecimal("0.0600");

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public int getRegisterGrantAmount() {
        return registerGrantAmount;
    }

    public void setRegisterGrantAmount(int registerGrantAmount) {
        this.registerGrantAmount = registerGrantAmount;
    }

    public boolean isRegisterGrantEnabled() {
        return registerGrantEnabled;
    }

    public void setRegisterGrantEnabled(boolean registerGrantEnabled) {
        this.registerGrantEnabled = registerGrantEnabled;
    }

    public BigDecimal getModelBaseInputCreditPer1k() {
        return modelBaseInputCreditPer1k;
    }

    public void setModelBaseInputCreditPer1k(BigDecimal modelBaseInputCreditPer1k) {
        this.modelBaseInputCreditPer1k = modelBaseInputCreditPer1k;
    }

    public BigDecimal getModelBaseOutputCreditPer1k() {
        return modelBaseOutputCreditPer1k;
    }

    public void setModelBaseOutputCreditPer1k(BigDecimal modelBaseOutputCreditPer1k) {
        this.modelBaseOutputCreditPer1k = modelBaseOutputCreditPer1k;
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
