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
 * 系统级环境变量运行时覆盖配置。
 * 首版只开放固定 Key 注册表，不支持后台自由新增任意变量项。
 */
@Entity
@Table(name = "platform_env_var_config")
public class PlatformEnvVarConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 固定环境变量 Key，例如 PLATFORM_GITEE_BINDING_ACCESS_TOKEN。
     */
    @Column(name = "env_key", nullable = false, unique = true, length = 120)
    private String envKey;

    /**
     * 当前配置来源：STATIC / HTTP。
     */
    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType;

    /**
     * STATIC 模式下的固定值密文。
     */
    @Column(name = "static_value_ciphertext", columnDefinition = "TEXT")
    private String staticValueCiphertext;

    /**
     * HTTP 模式下的取值地址。
     */
    @Column(name = "http_url", length = 500)
    private String httpUrl;

    /**
     * HTTP 模式下请求头 JSON 密文。
     */
    @Column(name = "http_headers_ciphertext", columnDefinition = "TEXT")
    private String httpHeadersCiphertext;

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

    public String getEnvKey() {
        return envKey;
    }

    public void setEnvKey(String envKey) {
        this.envKey = envKey;
    }

    public String getSourceType() {
        return sourceType;
    }

    public void setSourceType(String sourceType) {
        this.sourceType = sourceType;
    }

    public String getStaticValueCiphertext() {
        return staticValueCiphertext;
    }

    public void setStaticValueCiphertext(String staticValueCiphertext) {
        this.staticValueCiphertext = staticValueCiphertext;
    }

    public String getHttpUrl() {
        return httpUrl;
    }

    public void setHttpUrl(String httpUrl) {
        this.httpUrl = httpUrl;
    }

    public String getHttpHeadersCiphertext() {
        return httpHeadersCiphertext;
    }

    public void setHttpHeadersCiphertext(String httpHeadersCiphertext) {
        this.httpHeadersCiphertext = httpHeadersCiphertext;
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
