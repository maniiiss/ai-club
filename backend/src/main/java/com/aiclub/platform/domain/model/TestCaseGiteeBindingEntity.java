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
 * 本地测试用例与 Gitee 测试用例的绑定关系。
 * V1 仅用于判断远端走新增还是更新，不负责远端删除。
 */
@Entity
@Table(name = "test_case_gitee_binding")
public class TestCaseGiteeBindingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "test_case_id", nullable = false)
    private TestCaseEntity testCase;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "test_plan_id", nullable = false)
    private TestPlanEntity testPlan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "iteration_id", nullable = false)
    private IterationEntity iteration;

    @Column(name = "enterprise_id", nullable = false)
    private Long enterpriseId;

    @Column(name = "gitee_program_id", nullable = false)
    private Long giteeProgramId;

    @Column(name = "gitee_test_plan_id", nullable = false)
    private Long giteeTestPlanId;

    @Column(name = "gitee_test_case_id", nullable = false)
    private Long giteeTestCaseId;

    @Column(name = "last_pushed_at")
    private LocalDateTime lastPushedAt;

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

    public TestCaseEntity getTestCase() {
        return testCase;
    }

    public void setTestCase(TestCaseEntity testCase) {
        this.testCase = testCase;
    }

    public TestPlanEntity getTestPlan() {
        return testPlan;
    }

    public void setTestPlan(TestPlanEntity testPlan) {
        this.testPlan = testPlan;
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

    public Long getEnterpriseId() {
        return enterpriseId;
    }

    public void setEnterpriseId(Long enterpriseId) {
        this.enterpriseId = enterpriseId;
    }

    public Long getGiteeProgramId() {
        return giteeProgramId;
    }

    public void setGiteeProgramId(Long giteeProgramId) {
        this.giteeProgramId = giteeProgramId;
    }

    public Long getGiteeTestPlanId() {
        return giteeTestPlanId;
    }

    public void setGiteeTestPlanId(Long giteeTestPlanId) {
        this.giteeTestPlanId = giteeTestPlanId;
    }

    public Long getGiteeTestCaseId() {
        return giteeTestCaseId;
    }

    public void setGiteeTestCaseId(Long giteeTestCaseId) {
        this.giteeTestCaseId = giteeTestCaseId;
    }

    public LocalDateTime getLastPushedAt() {
        return lastPushedAt;
    }

    public void setLastPushedAt(LocalDateTime lastPushedAt) {
        this.lastPushedAt = lastPushedAt;
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
