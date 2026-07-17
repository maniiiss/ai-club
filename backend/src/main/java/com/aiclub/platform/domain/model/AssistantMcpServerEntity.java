package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * GitPilot 用户个人 MCP 服务配置。
 * 业务意图：保存当前可用配置及历史密文版本，使新会话和历史会话可以隔离配置变更。
 */
@Entity
@Table(name = "assistant_mcp_server")
public class AssistantMcpServerEntity {

    /** MCP 服务主键。 */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 配置归属用户。 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    /** 用户在 MCP 面板中看到的服务名称。 */
    @Column(nullable = false, length = 120)
    private String name = "";

    /** 远程 MCP HTTP/SSE 入口地址。 */
    @Column(name = "endpoint_url", nullable = false, length = 1000)
    private String endpointUrl = "";

    /** 传输方式；AUTO 表示优先 Streamable HTTP，失败时尝试 SSE。 */
    @Column(nullable = false, length = 30)
    private String transport = "AUTO";

    /** 认证方式：NONE、BEARER 或 API_KEY。 */
    @Column(name = "auth_type", nullable = false, length = 30)
    private String authType = "NONE";

    /** 当前凭证密文，不允许通过 API 明文回显。 */
    @Column(name = "credential_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String credentialCiphertext = "";

    /** 历史配置版本密文 JSON，供会话快照引用旧版本。 */
    @Column(name = "config_history_ciphertext", nullable = false, columnDefinition = "TEXT")
    private String configHistoryCiphertext = "[]";

    /** 是否加入后续新 GitPilot 会话。 */
    @Column(nullable = false)
    private boolean enabled = true;

    /** 配置版本号；每次 endpoint、认证或工具发现结果变化都会递增。 */
    @Column(name = "config_version", nullable = false)
    private Long configVersion = 1L;

    /** 最近一次连接状态。 */
    @Column(name = "connection_status", nullable = false, length = 20)
    private String connectionStatus = "UNKNOWN";

    /** 最近一次连接诊断信息。 */
    @Column(name = "connection_message", nullable = false, length = 1000)
    private String connectionMessage = "";

    /** MCP initialize 返回的服务信息。 */
    @Column(name = "server_info_json", nullable = false, columnDefinition = "TEXT")
    private String serverInfoJson = "{}";

    /** 已发现工具定义 JSON。 */
    @Column(name = "tools_json", nullable = false, columnDefinition = "TEXT")
    private String toolsJson = "[]";

    /** 最近成功或失败测试时间。 */
    @Column(name = "last_tested_at")
    private LocalDateTime lastTestedAt;

    /** 创建时间。 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** 更新时间。 */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }
    public String getTransport() { return transport; }
    public void setTransport(String transport) { this.transport = transport; }
    public String getAuthType() { return authType; }
    public void setAuthType(String authType) { this.authType = authType; }
    public String getCredentialCiphertext() { return credentialCiphertext; }
    public void setCredentialCiphertext(String credentialCiphertext) { this.credentialCiphertext = credentialCiphertext; }
    public String getConfigHistoryCiphertext() { return configHistoryCiphertext; }
    public void setConfigHistoryCiphertext(String configHistoryCiphertext) { this.configHistoryCiphertext = configHistoryCiphertext; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Long getConfigVersion() { return configVersion; }
    public void setConfigVersion(Long configVersion) { this.configVersion = configVersion; }
    public String getConnectionStatus() { return connectionStatus; }
    public void setConnectionStatus(String connectionStatus) { this.connectionStatus = connectionStatus; }
    public String getConnectionMessage() { return connectionMessage; }
    public void setConnectionMessage(String connectionMessage) { this.connectionMessage = connectionMessage; }
    public String getServerInfoJson() { return serverInfoJson; }
    public void setServerInfoJson(String serverInfoJson) { this.serverInfoJson = serverInfoJson; }
    public String getToolsJson() { return toolsJson; }
    public void setToolsJson(String toolsJson) { this.toolsJson = toolsJson; }
    public LocalDateTime getLastTestedAt() { return lastTestedAt; }
    public void setLastTestedAt(LocalDateTime lastTestedAt) { this.lastTestedAt = lastTestedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
