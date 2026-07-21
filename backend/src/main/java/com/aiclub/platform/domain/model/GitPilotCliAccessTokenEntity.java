package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * GitPilot CLI 长期设备凭据的服务端记录。
 * 业务意图：数据库只保存 hash 和审计元数据，即使数据库泄露也不能直接复用 CLI Token。
 */
@Entity
@Table(name = "gitpilot_cli_access_token")
public class GitPilotCliAccessTokenEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "token_prefix", nullable = false, length = 24)
    private String tokenPrefix;

    @Column(name = "scopes_json", nullable = false, columnDefinition = "TEXT")
    private String scopesJson = "[]";

    @Column(name = "client_version", nullable = false, length = 40)
    private String clientVersion = "";

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }
    public String getTokenPrefix() { return tokenPrefix; }
    public void setTokenPrefix(String tokenPrefix) { this.tokenPrefix = tokenPrefix; }
    public String getScopesJson() { return scopesJson; }
    public void setScopesJson(String scopesJson) { this.scopesJson = scopesJson; }
    public String getClientVersion() { return clientVersion; }
    public void setClientVersion(String clientVersion) { this.clientVersion = clientVersion; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
    public LocalDateTime getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(LocalDateTime lastUsedAt) { this.lastUsedAt = lastUsedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
