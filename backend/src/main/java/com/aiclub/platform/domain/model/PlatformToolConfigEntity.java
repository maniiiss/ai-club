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
 * 平台工具配置覆盖实体。
 * 工具真实实现仍由代码注册，本表仅用于后续后台启停和描述覆盖。
 */
@Entity
@Table(name = "platform_tool_config")
public class PlatformToolConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 工具编码。
     */
    @Column(name = "tool_code", nullable = false, unique = true, length = 100)
    private String toolCode;

    /**
     * 展示名称覆盖。
     */
    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName = "";

    /**
     * 工具描述覆盖。
     */
    @Column(name = "description_override", nullable = false, length = 1000)
    private String descriptionOverride = "";

    /**
     * 是否启用。
     */
    @Column(nullable = false)
    private boolean enabled = true;

    /**
     * 是否允许自动执行。
     * 第一版只读工具默认自动，写工具仍必须确认。
     */
    @Column(name = "allow_auto_execute", nullable = false)
    private boolean allowAutoExecute;

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

    public String getToolCode() {
        return toolCode;
    }

    public void setToolCode(String toolCode) {
        this.toolCode = toolCode;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getDescriptionOverride() {
        return descriptionOverride;
    }

    public void setDescriptionOverride(String descriptionOverride) {
        this.descriptionOverride = descriptionOverride;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isAllowAutoExecute() {
        return allowAutoExecute;
    }

    public void setAllowAutoExecute(boolean allowAutoExecute) {
        this.allowAutoExecute = allowAutoExecute;
    }
}
