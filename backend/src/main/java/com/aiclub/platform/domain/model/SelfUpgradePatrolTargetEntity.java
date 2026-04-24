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
 * 单个巡检计划下的探索入口。
 * 一个计划可维护多个页面入口与目标提示，巡检时按 sortOrder 顺序执行。
 */
@Entity
@Table(name = "self_upgrade_patrol_target")
public class SelfUpgradePatrolTargetEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private SelfUpgradePatrolPlanEntity plan;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "seed_url", nullable = false, length = 500)
    private String seedUrl;

    @Column(name = "goal_prompt", nullable = false, columnDefinition = "TEXT")
    private String goalPrompt = "";

    @Column(name = "ready_selector", length = 300)
    private String readySelector;

    @Column(name = "allow_write", nullable = false)
    private boolean allowWrite;

    @Column(name = "write_allowlist_override_json", nullable = false, columnDefinition = "TEXT")
    private String writeAllowlistOverrideJson = "[]";

    @Column(name = "max_steps_override")
    private Integer maxStepsOverride;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

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

    public SelfUpgradePatrolPlanEntity getPlan() {
        return plan;
    }

    public void setPlan(SelfUpgradePatrolPlanEntity plan) {
        this.plan = plan;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSeedUrl() {
        return seedUrl;
    }

    public void setSeedUrl(String seedUrl) {
        this.seedUrl = seedUrl;
    }

    public String getGoalPrompt() {
        return goalPrompt;
    }

    public void setGoalPrompt(String goalPrompt) {
        this.goalPrompt = goalPrompt;
    }

    public String getReadySelector() {
        return readySelector;
    }

    public void setReadySelector(String readySelector) {
        this.readySelector = readySelector;
    }

    public boolean isAllowWrite() {
        return allowWrite;
    }

    public void setAllowWrite(boolean allowWrite) {
        this.allowWrite = allowWrite;
    }

    public String getWriteAllowlistOverrideJson() {
        return writeAllowlistOverrideJson;
    }

    public void setWriteAllowlistOverrideJson(String writeAllowlistOverrideJson) {
        this.writeAllowlistOverrideJson = writeAllowlistOverrideJson;
    }

    public Integer getMaxStepsOverride() {
        return maxStepsOverride;
    }

    public void setMaxStepsOverride(Integer maxStepsOverride) {
        this.maxStepsOverride = maxStepsOverride;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
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
