package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 自升级巡检环境档案。
 * v1 先提供 STAGING 作为默认档案，但字段设计保持为可扩展的多环境模型。
 */
@Entity
@Table(name = "self_upgrade_environment_profile")
public class SelfUpgradeEnvironmentProfileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 环境编码，例如 STAGING。 */
    @Column(nullable = false, length = 40)
    private String code;

    /** 环境展示名称。 */
    @Column(nullable = false, length = 120)
    private String name;

    /** 巡检入口的基础访问地址。 */
    @Column(name = "base_url", nullable = false, length = 255)
    private String baseUrl;

    /** 允许浏览器继续探索的主机白名单。 */
    @Column(name = "allowed_host_patterns_json", nullable = false, columnDefinition = "TEXT")
    private String allowedHostPatternsJson = "[]";

    /** 登录脚本，按结构化动作 JSON 存储。 */
    @Column(name = "login_script_json", nullable = false, columnDefinition = "TEXT")
    private String loginScriptJson = "[]";

    /** 供受控沙箱登录使用的用户名。 */
    @Column(name = "sandbox_username", nullable = false, length = 120)
    private String sandboxUsername = "";

    /** 受控沙箱密码密文。 */
    @Column(name = "sandbox_password_ciphertext", columnDefinition = "TEXT")
    private String sandboxPasswordCiphertext;

    /** 可复用的登录态快照密文。 */
    @Column(name = "session_state_ciphertext", columnDefinition = "TEXT")
    private String sessionStateCiphertext;

    /** 写入动作白名单，使用 JSON 文本保存。 */
    @Column(name = "write_allowlist_json", nullable = false, columnDefinition = "TEXT")
    private String writeAllowlistJson = "[]";

    @Column(nullable = false)
    private boolean enabled = true;

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

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getAllowedHostPatternsJson() {
        return allowedHostPatternsJson;
    }

    public void setAllowedHostPatternsJson(String allowedHostPatternsJson) {
        this.allowedHostPatternsJson = allowedHostPatternsJson;
    }

    public String getLoginScriptJson() {
        return loginScriptJson;
    }

    public void setLoginScriptJson(String loginScriptJson) {
        this.loginScriptJson = loginScriptJson;
    }

    public String getSandboxUsername() {
        return sandboxUsername;
    }

    public void setSandboxUsername(String sandboxUsername) {
        this.sandboxUsername = sandboxUsername;
    }

    public String getSandboxPasswordCiphertext() {
        return sandboxPasswordCiphertext;
    }

    public void setSandboxPasswordCiphertext(String sandboxPasswordCiphertext) {
        this.sandboxPasswordCiphertext = sandboxPasswordCiphertext;
    }

    public String getSessionStateCiphertext() {
        return sessionStateCiphertext;
    }

    public void setSessionStateCiphertext(String sessionStateCiphertext) {
        this.sessionStateCiphertext = sessionStateCiphertext;
    }

    public String getWriteAllowlistJson() {
        return writeAllowlistJson;
    }

    public void setWriteAllowlistJson(String writeAllowlistJson) {
        this.writeAllowlistJson = writeAllowlistJson;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
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
