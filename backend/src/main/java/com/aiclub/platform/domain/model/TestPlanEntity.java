package com.aiclub.platform.domain.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "test_plan_info")
public class TestPlanEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, length = 30)
    private String status = "草稿";

    @Column(nullable = false, length = 2000)
    private String description = "";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "iteration_id")
    private IterationEntity iteration;

    /**
     * 自动化测试关联的 GitLab 仓库绑定。
     * V1 固定一个测试计划只关联一个前端仓库。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "automation_binding_id")
    private ProjectGitlabBindingEntity automationBinding;

    /**
     * 自动化执行默认分支。
     * 为空时回退到仓库绑定中的默认目标分支。
     */
    @Column(name = "automation_target_branch", length = 100)
    private String automationTargetBranch;

    /**
     * 最近一次自动化关联的执行任务 ID。
     * 用于测试计划详情页快速跳转到执行中心。
     */
    @Column(name = "last_automation_task_id")
    private Long lastAutomationTaskId;

    /**
     * 最近一次自动化运行 ID。
     */
    @Column(name = "last_automation_run_id")
    private Long lastAutomationRunId;

    /**
     * 最近一次自动化执行状态。
     */
    @Column(name = "last_automation_status", nullable = false, length = 30)
    private String lastAutomationStatus = "IDLE";

    /**
     * 最近一次自动化摘要。
     */
    @Column(name = "last_automation_summary", length = 1000)
    private String lastAutomationSummary;

    /**
     * 最近一次自动化执行时间。
     */
    @Column(name = "last_automation_at")
    private LocalDateTime lastAutomationAt;

    /**
     * 最近一次自动化脚本生成对应的 Merge Request 链接。
     */
    @Column(name = "last_automation_mr_url", length = 500)
    private String lastAutomationMrUrl;

    @OneToMany(mappedBy = "testPlan", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    private List<TestCaseEntity> cases = new ArrayList<>();

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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public IterationEntity getIteration() {
        return iteration;
    }

    public void setIteration(IterationEntity iteration) {
        this.iteration = iteration;
    }

    public ProjectGitlabBindingEntity getAutomationBinding() {
        return automationBinding;
    }

    public void setAutomationBinding(ProjectGitlabBindingEntity automationBinding) {
        this.automationBinding = automationBinding;
    }

    public String getAutomationTargetBranch() {
        return automationTargetBranch;
    }

    public void setAutomationTargetBranch(String automationTargetBranch) {
        this.automationTargetBranch = automationTargetBranch;
    }

    public Long getLastAutomationTaskId() {
        return lastAutomationTaskId;
    }

    public void setLastAutomationTaskId(Long lastAutomationTaskId) {
        this.lastAutomationTaskId = lastAutomationTaskId;
    }

    public Long getLastAutomationRunId() {
        return lastAutomationRunId;
    }

    public void setLastAutomationRunId(Long lastAutomationRunId) {
        this.lastAutomationRunId = lastAutomationRunId;
    }

    public String getLastAutomationStatus() {
        return lastAutomationStatus;
    }

    public void setLastAutomationStatus(String lastAutomationStatus) {
        this.lastAutomationStatus = lastAutomationStatus;
    }

    public String getLastAutomationSummary() {
        return lastAutomationSummary;
    }

    public void setLastAutomationSummary(String lastAutomationSummary) {
        this.lastAutomationSummary = lastAutomationSummary;
    }

    public LocalDateTime getLastAutomationAt() {
        return lastAutomationAt;
    }

    public void setLastAutomationAt(LocalDateTime lastAutomationAt) {
        this.lastAutomationAt = lastAutomationAt;
    }

    public String getLastAutomationMrUrl() {
        return lastAutomationMrUrl;
    }

    public void setLastAutomationMrUrl(String lastAutomationMrUrl) {
        this.lastAutomationMrUrl = lastAutomationMrUrl;
    }

    public List<TestCaseEntity> getCases() {
        return cases;
    }

    public void setCases(List<TestCaseEntity> cases) {
        this.cases = cases;
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
