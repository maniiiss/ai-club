package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - 环境变量。
 * 保存环境级别的键值对变量，支持 secret 标记加密存储。
 * baseUrl 是系统内置变量，来自环境 base_url，不允许用户覆盖。
 * 变量引用语法：{{variableName}}，支持 URL、Header、Query、Body。
 */
@Entity
@Table(name = "api_studio_environment_variable")
public class ApiStudioEnvironmentVariableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "environment_id", nullable = false)
    private Long environmentId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "value_ciphertext", columnDefinition = "TEXT")
    private String valueCiphertext;

    @Column(nullable = false)
    private Boolean secret = false;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEnvironmentId() { return environmentId; }
    public void setEnvironmentId(Long environmentId) { this.environmentId = environmentId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getValueCiphertext() { return valueCiphertext; }
    public void setValueCiphertext(String valueCiphertext) { this.valueCiphertext = valueCiphertext; }

    public Boolean getSecret() { return secret; }
    public void setSecret(Boolean secret) { this.secret = secret; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
