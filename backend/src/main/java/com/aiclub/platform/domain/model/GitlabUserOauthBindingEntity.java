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
 * 当前平台用户绑定的 GitLab OAuth 凭证。
 * 这里只保存默认 GitLab 实例的用户身份信息，用于手动快速发起 MR。
 */
@Entity
@Table(name = "gitlab_user_oauth_binding")
public class GitlabUserOauthBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 绑定所属的平台用户，一名用户仅保留一条当前有效绑定。
     */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private UserEntity user;

    /**
     * 当前绑定对应的 GitLab API 地址，v1 约定为默认 GitLab 实例地址。
     */
    @Column(name = "api_base_url", nullable = false, length = 255)
    private String apiBaseUrl;

    /**
     * GitLab 侧用户 ID，便于后续排查授权人与当前账号是否一致。
     */
    @Column(name = "gitlab_user_id", nullable = false)
    private Long gitlabUserId;

    /**
     * GitLab 用户名，会同步回写到平台用户资料中的兼容字段。
     */
    @Column(name = "gitlab_username", nullable = false, length = 100)
    private String gitlabUsername;

    /**
     * GitLab 展示名称，供前端结果弹窗和个人中心展示。
     */
    @Column(name = "gitlab_name", nullable = false, length = 100)
    private String gitlabName;

    /**
     * OAuth access token，必须加密后落库。
     */
    @Column(name = "access_token_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String accessTokenCiphertext;

    /**
     * OAuth refresh token，允许为空，缺失时授权过期只能重新绑定。
     */
    @Column(name = "refresh_token_ciphertext", columnDefinition = "TEXT")
    private String refreshTokenCiphertext;

    /**
     * access token 过期时间，达到该时间后需要优先尝试刷新。
     */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

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

    public UserEntity getUser() {
        return user;
    }

    public void setUser(UserEntity user) {
        this.user = user;
    }

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public void setApiBaseUrl(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
    }

    public Long getGitlabUserId() {
        return gitlabUserId;
    }

    public void setGitlabUserId(Long gitlabUserId) {
        this.gitlabUserId = gitlabUserId;
    }

    public String getGitlabUsername() {
        return gitlabUsername;
    }

    public void setGitlabUsername(String gitlabUsername) {
        this.gitlabUsername = gitlabUsername;
    }

    public String getGitlabName() {
        return gitlabName;
    }

    public void setGitlabName(String gitlabName) {
        this.gitlabName = gitlabName;
    }

    public String getAccessTokenCiphertext() {
        return accessTokenCiphertext;
    }

    public void setAccessTokenCiphertext(String accessTokenCiphertext) {
        this.accessTokenCiphertext = accessTokenCiphertext;
    }

    public String getRefreshTokenCiphertext() {
        return refreshTokenCiphertext;
    }

    public void setRefreshTokenCiphertext(String refreshTokenCiphertext) {
        this.refreshTokenCiphertext = refreshTokenCiphertext;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
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
