package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

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
