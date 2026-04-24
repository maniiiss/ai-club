package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 自升级中心单例配置。
 * 独立保存 carrier project、默认仓库绑定与整改阶段 agent，不复用 task_info 等业务对象。
 */
@Entity
@Table(name = "self_upgrade_center_config")
public class SelfUpgradeCenterConfigEntity {

    @Id
    private Long id;

    /** 默认巡检环境档案。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "default_environment_profile_id")
    private SelfUpgradeEnvironmentProfileEntity defaultEnvironmentProfile;

    /** 自升级对接执行中心时使用的内部载体项目。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carrier_project_id")
    private ProjectEntity carrierProject;

    /** 自升级整改默认作用的仓库绑定 JSON。 */
    @Column(name = "default_repository_binding_ids_json", nullable = false, columnDefinition = "TEXT")
    private String defaultRepositoryBindingIdsJson = "[]";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "development_plan_agent_id")
    private AgentEntity developmentPlanAgent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "development_implement_agent_id")
    private AgentEntity developmentImplementAgent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "development_test_agent_id")
    private AgentEntity developmentTestAgent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "development_report_agent_id")
    private AgentEntity developmentReportAgent;

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

    public SelfUpgradeEnvironmentProfileEntity getDefaultEnvironmentProfile() {
        return defaultEnvironmentProfile;
    }

    public void setDefaultEnvironmentProfile(SelfUpgradeEnvironmentProfileEntity defaultEnvironmentProfile) {
        this.defaultEnvironmentProfile = defaultEnvironmentProfile;
    }

    public ProjectEntity getCarrierProject() {
        return carrierProject;
    }

    public void setCarrierProject(ProjectEntity carrierProject) {
        this.carrierProject = carrierProject;
    }

    public String getDefaultRepositoryBindingIdsJson() {
        return defaultRepositoryBindingIdsJson;
    }

    public void setDefaultRepositoryBindingIdsJson(String defaultRepositoryBindingIdsJson) {
        this.defaultRepositoryBindingIdsJson = defaultRepositoryBindingIdsJson;
    }

    public AgentEntity getDevelopmentPlanAgent() {
        return developmentPlanAgent;
    }

    public void setDevelopmentPlanAgent(AgentEntity developmentPlanAgent) {
        this.developmentPlanAgent = developmentPlanAgent;
    }

    public AgentEntity getDevelopmentImplementAgent() {
        return developmentImplementAgent;
    }

    public void setDevelopmentImplementAgent(AgentEntity developmentImplementAgent) {
        this.developmentImplementAgent = developmentImplementAgent;
    }

    public AgentEntity getDevelopmentTestAgent() {
        return developmentTestAgent;
    }

    public void setDevelopmentTestAgent(AgentEntity developmentTestAgent) {
        this.developmentTestAgent = developmentTestAgent;
    }

    public AgentEntity getDevelopmentReportAgent() {
        return developmentReportAgent;
    }

    public void setDevelopmentReportAgent(AgentEntity developmentReportAgent) {
        this.developmentReportAgent = developmentReportAgent;
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
