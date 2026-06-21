package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 用户积分账户，保存当前余额和累计收支，用于公众端 AI 能力消费前的余额校验。
 */
@Entity
@Table(name = "user_credit_account")
public class UserCreditAccountEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(nullable = false)
    private int balance = 0;

    @Column(name = "total_granted", nullable = false)
    private int totalGranted = 0;

    @Column(name = "total_consumed", nullable = false)
    private int totalConsumed = 0;

    @Column(name = "total_refunded", nullable = false)
    private int totalRefunded = 0;

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

    public UserEntity getUser() {
        return user;
    }

    public void setUser(UserEntity user) {
        this.user = user;
    }

    public int getBalance() {
        return balance;
    }

    public void setBalance(int balance) {
        this.balance = balance;
    }

    public int getTotalGranted() {
        return totalGranted;
    }

    public void setTotalGranted(int totalGranted) {
        this.totalGranted = totalGranted;
    }

    public int getTotalConsumed() {
        return totalConsumed;
    }

    public void setTotalConsumed(int totalConsumed) {
        this.totalConsumed = totalConsumed;
    }

    public int getTotalRefunded() {
        return totalRefunded;
    }

    public void setTotalRefunded(int totalRefunded) {
        this.totalRefunded = totalRefunded;
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
