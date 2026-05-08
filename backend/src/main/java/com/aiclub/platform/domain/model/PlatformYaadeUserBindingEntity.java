package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 平台用户与 Yaade 本地账号的绑定快照。
 * 平台代登录模式下，依赖这里保存受控账号与密码映射。
 */
@Entity
@Table(name = "platform_yaade_user_binding")
public class PlatformYaadeUserBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "yaade_user_id", nullable = false)
    private Long yaadeUserId;

    @Column(name = "yaade_username", nullable = false, length = 120)
    private String yaadeUsername;

    /**
     * 平台代持的 Yaade 本地密码，避免把默认密码长期暴露给最终用户。
     */
    @Column(name = "password_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String passwordCiphertext;

    @Column(name = "last_synced_at", nullable = false)
    private LocalDateTime lastSyncedAt = LocalDateTime.now();

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getYaadeUserId() {
        return yaadeUserId;
    }

    public void setYaadeUserId(Long yaadeUserId) {
        this.yaadeUserId = yaadeUserId;
    }

    public String getYaadeUsername() {
        return yaadeUsername;
    }

    public void setYaadeUsername(String yaadeUsername) {
        this.yaadeUsername = yaadeUsername;
    }

    public String getPasswordCiphertext() {
        return passwordCiphertext;
    }

    public void setPasswordCiphertext(String passwordCiphertext) {
        this.passwordCiphertext = passwordCiphertext;
    }

    public LocalDateTime getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(LocalDateTime lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
    }
}
