package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinTable;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 平台级服务器接入实体。
 * 敏感凭据统一以 *_ciphertext 形式存储，禁止把明文密码或私钥落库。
 */
@Entity
@Table(name = "server_info")
public class ServerInfoEntity {

    public static final String OS_TYPE_LINUX = "LINUX";
    public static final String AUTH_TYPE_PASSWORD = "PASSWORD";
    public static final String AUTH_TYPE_PRIVATE_KEY = "PRIVATE_KEY";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 500)
    private String description = "";

    @Column(nullable = false, length = 255)
    private String host;

    @Column(nullable = false)
    private Integer port = 22;

    @Column(nullable = false, length = 120)
    private String username;

    @Column(name = "os_type", nullable = false, length = 30)
    private String osType = OS_TYPE_LINUX;

    @Column(name = "auth_type", nullable = false, length = 30)
    private String authType = AUTH_TYPE_PASSWORD;

    @Column(name = "password_ciphertext", columnDefinition = "TEXT")
    private String passwordCiphertext;

    @Column(name = "private_key_ciphertext", columnDefinition = "TEXT")
    private String privateKeyCiphertext;

    @Column(name = "private_key_passphrase_ciphertext", columnDefinition = "TEXT")
    private String privateKeyPassphraseCiphertext;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(name = "jump_host_enabled", nullable = false)
    private boolean jumpHostEnabled;

    @Column(name = "jump_host", length = 255)
    private String jumpHost;

    @Column(name = "jump_port")
    private Integer jumpPort;

    @Column(name = "jump_username", length = 120)
    private String jumpUsername;

    @Column(name = "jump_auth_type", length = 30)
    private String jumpAuthType;

    @Column(name = "jump_password_ciphertext", columnDefinition = "TEXT")
    private String jumpPasswordCiphertext;

    @Column(name = "jump_private_key_ciphertext", columnDefinition = "TEXT")
    private String jumpPrivateKeyCiphertext;

    @Column(name = "jump_private_key_passphrase_ciphertext", columnDefinition = "TEXT")
    private String jumpPrivateKeyPassphraseCiphertext;

    @Column(name = "connectivity_alert_enabled_override")
    private Boolean connectivityAlertEnabledOverride;

    @Column(name = "cpu_threshold_percent_override")
    private Integer cpuThresholdPercentOverride;

    @Column(name = "memory_threshold_percent_override")
    private Integer memoryThresholdPercentOverride;

    @Column(name = "disk_threshold_percent_override")
    private Integer diskThresholdPercentOverride;

    @Column(name = "consecutive_breaches_override")
    private Integer consecutiveBreachesOverride;

    @Column(name = "cooldown_minutes_override")
    private Integer cooldownMinutesOverride;

    @Column(name = "last_probe_status", length = 30)
    private String lastProbeStatus;

    @Column(name = "last_probe_message", length = 500)
    private String lastProbeMessage;

    @Column(name = "last_probed_at")
    private LocalDateTime lastProbedAt;

    @Column(name = "last_cpu_usage_percent")
    private Integer lastCpuUsagePercent;

    @Column(name = "last_memory_usage_percent")
    private Integer lastMemoryUsagePercent;

    @Column(name = "last_disk_usage_percent")
    private Integer lastDiskUsagePercent;

    @Column(name = "active_alert_count", nullable = false)
    private Integer activeAlertCount = 0;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "server_alert_recipient_rel",
            joinColumns = @JoinColumn(name = "server_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<UserEntity> alertRecipients = new LinkedHashSet<>();

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getHost() {
        return host;
    }

    public void setHost(String host) {
        this.host = host;
    }

    public Integer getPort() {
        return port;
    }

    public void setPort(Integer port) {
        this.port = port;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getOsType() {
        return osType;
    }

    public void setOsType(String osType) {
        this.osType = osType;
    }

    public String getAuthType() {
        return authType;
    }

    public void setAuthType(String authType) {
        this.authType = authType;
    }

    public String getPasswordCiphertext() {
        return passwordCiphertext;
    }

    public void setPasswordCiphertext(String passwordCiphertext) {
        this.passwordCiphertext = passwordCiphertext;
    }

    public String getPrivateKeyCiphertext() {
        return privateKeyCiphertext;
    }

    public void setPrivateKeyCiphertext(String privateKeyCiphertext) {
        this.privateKeyCiphertext = privateKeyCiphertext;
    }

    public String getPrivateKeyPassphraseCiphertext() {
        return privateKeyPassphraseCiphertext;
    }

    public void setPrivateKeyPassphraseCiphertext(String privateKeyPassphraseCiphertext) {
        this.privateKeyPassphraseCiphertext = privateKeyPassphraseCiphertext;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isJumpHostEnabled() {
        return jumpHostEnabled;
    }

    public void setJumpHostEnabled(boolean jumpHostEnabled) {
        this.jumpHostEnabled = jumpHostEnabled;
    }

    public String getJumpHost() {
        return jumpHost;
    }

    public void setJumpHost(String jumpHost) {
        this.jumpHost = jumpHost;
    }

    public Integer getJumpPort() {
        return jumpPort;
    }

    public void setJumpPort(Integer jumpPort) {
        this.jumpPort = jumpPort;
    }

    public String getJumpUsername() {
        return jumpUsername;
    }

    public void setJumpUsername(String jumpUsername) {
        this.jumpUsername = jumpUsername;
    }

    public String getJumpAuthType() {
        return jumpAuthType;
    }

    public void setJumpAuthType(String jumpAuthType) {
        this.jumpAuthType = jumpAuthType;
    }

    public String getJumpPasswordCiphertext() {
        return jumpPasswordCiphertext;
    }

    public void setJumpPasswordCiphertext(String jumpPasswordCiphertext) {
        this.jumpPasswordCiphertext = jumpPasswordCiphertext;
    }

    public String getJumpPrivateKeyCiphertext() {
        return jumpPrivateKeyCiphertext;
    }

    public void setJumpPrivateKeyCiphertext(String jumpPrivateKeyCiphertext) {
        this.jumpPrivateKeyCiphertext = jumpPrivateKeyCiphertext;
    }

    public String getJumpPrivateKeyPassphraseCiphertext() {
        return jumpPrivateKeyPassphraseCiphertext;
    }

    public void setJumpPrivateKeyPassphraseCiphertext(String jumpPrivateKeyPassphraseCiphertext) {
        this.jumpPrivateKeyPassphraseCiphertext = jumpPrivateKeyPassphraseCiphertext;
    }

    public Boolean getConnectivityAlertEnabledOverride() {
        return connectivityAlertEnabledOverride;
    }

    public void setConnectivityAlertEnabledOverride(Boolean connectivityAlertEnabledOverride) {
        this.connectivityAlertEnabledOverride = connectivityAlertEnabledOverride;
    }

    public Integer getCpuThresholdPercentOverride() {
        return cpuThresholdPercentOverride;
    }

    public void setCpuThresholdPercentOverride(Integer cpuThresholdPercentOverride) {
        this.cpuThresholdPercentOverride = cpuThresholdPercentOverride;
    }

    public Integer getMemoryThresholdPercentOverride() {
        return memoryThresholdPercentOverride;
    }

    public void setMemoryThresholdPercentOverride(Integer memoryThresholdPercentOverride) {
        this.memoryThresholdPercentOverride = memoryThresholdPercentOverride;
    }

    public Integer getDiskThresholdPercentOverride() {
        return diskThresholdPercentOverride;
    }

    public void setDiskThresholdPercentOverride(Integer diskThresholdPercentOverride) {
        this.diskThresholdPercentOverride = diskThresholdPercentOverride;
    }

    public Integer getConsecutiveBreachesOverride() {
        return consecutiveBreachesOverride;
    }

    public void setConsecutiveBreachesOverride(Integer consecutiveBreachesOverride) {
        this.consecutiveBreachesOverride = consecutiveBreachesOverride;
    }

    public Integer getCooldownMinutesOverride() {
        return cooldownMinutesOverride;
    }

    public void setCooldownMinutesOverride(Integer cooldownMinutesOverride) {
        this.cooldownMinutesOverride = cooldownMinutesOverride;
    }

    public String getLastProbeStatus() {
        return lastProbeStatus;
    }

    public void setLastProbeStatus(String lastProbeStatus) {
        this.lastProbeStatus = lastProbeStatus;
    }

    public String getLastProbeMessage() {
        return lastProbeMessage;
    }

    public void setLastProbeMessage(String lastProbeMessage) {
        this.lastProbeMessage = lastProbeMessage;
    }

    public LocalDateTime getLastProbedAt() {
        return lastProbedAt;
    }

    public void setLastProbedAt(LocalDateTime lastProbedAt) {
        this.lastProbedAt = lastProbedAt;
    }

    public Integer getLastCpuUsagePercent() {
        return lastCpuUsagePercent;
    }

    public void setLastCpuUsagePercent(Integer lastCpuUsagePercent) {
        this.lastCpuUsagePercent = lastCpuUsagePercent;
    }

    public Integer getLastMemoryUsagePercent() {
        return lastMemoryUsagePercent;
    }

    public void setLastMemoryUsagePercent(Integer lastMemoryUsagePercent) {
        this.lastMemoryUsagePercent = lastMemoryUsagePercent;
    }

    public Integer getLastDiskUsagePercent() {
        return lastDiskUsagePercent;
    }

    public void setLastDiskUsagePercent(Integer lastDiskUsagePercent) {
        this.lastDiskUsagePercent = lastDiskUsagePercent;
    }

    public Integer getActiveAlertCount() {
        return activeAlertCount;
    }

    public void setActiveAlertCount(Integer activeAlertCount) {
        this.activeAlertCount = activeAlertCount;
    }

    public Set<UserEntity> getAlertRecipients() {
        return alertRecipients;
    }

    public void setAlertRecipients(Set<UserEntity> alertRecipients) {
        this.alertRecipients = alertRecipients;
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
