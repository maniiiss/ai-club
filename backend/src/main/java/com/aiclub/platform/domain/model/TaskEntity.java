package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "task_info")
public class TaskEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    /**
     * 工作项编号，由后端自动生成，格式固定为 # + 6 位随机大写字母和数字。
     */
    @Column(name = "work_item_code", nullable = false, unique = true, length = 7)
    private String workItemCode;

    @Column(name = "work_item_type", nullable = false, length = 50)
    private String workItemType = "任务";

    @Column(nullable = false, length = 50)
    private String status;

    @Column(nullable = false, length = 30)
    private String priority;

    @Column(nullable = false, length = 50)
    private String assignee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_user_id")
    private UserEntity assigneeUser;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "task_collaborator_rel",
            joinColumns = @JoinColumn(name = "task_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<UserEntity> collaborators = new LinkedHashSet<>();

    /**
     * 创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description = "";

    /**
     * 需求模板 Markdown 文档。
     */
    @Column(name = "requirement_markdown", nullable = false, columnDefinition = "TEXT")
    private String requirementMarkdown = "";

    /**
     * 原型链接。
     */
    @Column(name = "prototype_url", nullable = false, length = 500)
    private String prototypeUrl = "";

    /**
     * 需求所属模块，作为 PRD 目录归档依据。
     */
    @Column(name = "module_name", nullable = false, length = 120)
    private String moduleName = "";

    /**
     * 需求开发是否通过。
     */
    @Column(name = "dev_passed", nullable = false)
    private boolean devPassed;

    /**
     * 需求测试是否通过。
     */
    @Column(name = "test_passed", nullable = false)
    private boolean testPassed;

    /**
     * 任务工时，单位为小时，最大 15 小时。
     */
    @Column(name = "work_hours", precision = 4, scale = 1)
    private BigDecimal workHours;

    /**
     * 工作项计划开始日期。
     */
    @Column(name = "plan_start_date")
    private LocalDate planStartDate;

    /**
     * 工作项计划结束日期。
     */
    @Column(name = "plan_end_date")
    private LocalDate planEndDate;

    /**
     * 当前逾期周期首次发送提醒的时间，用于避免同一轮逾期重复推送。
     */
    @Column(name = "overdue_notified_at")
    private LocalDateTime overdueNotifiedAt;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private ProjectEntity project;

    /**
     * 工作项创建人，仅创建人可以删除工作项。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creator_user_id")
    private UserEntity creatorUser;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_id")
    private AgentEntity agent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "iteration_id")
    private IterationEntity iteration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requirement_task_id")
    private TaskEntity requirementTask;

    public TaskEntity() {
    }

    public TaskEntity(String name, String workItemType, String status, String priority, String assignee, String description,
                      ProjectEntity project, AgentEntity agent, IterationEntity iteration) {
        this.name = name;
        this.workItemType = workItemType;
        this.status = status;
        this.priority = priority;
        this.assignee = assignee;
        this.description = description;
        this.project = project;
        this.agent = agent;
        this.iteration = iteration;
    }

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

    public String getWorkItemCode() {
        return workItemCode;
    }

    public void setWorkItemCode(String workItemCode) {
        this.workItemCode = workItemCode;
    }

    public String getWorkItemType() {
        return workItemType;
    }

    public void setWorkItemType(String workItemType) {
        this.workItemType = workItemType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getAssignee() {
        return assignee;
    }

    public void setAssignee(String assignee) {
        this.assignee = assignee;
    }

    public UserEntity getAssigneeUser() {
        return assigneeUser;
    }

    public void setAssigneeUser(UserEntity assigneeUser) {
        this.assigneeUser = assigneeUser;
    }

    public Set<UserEntity> getCollaborators() {
        return collaborators;
    }

    public void setCollaborators(Set<UserEntity> collaborators) {
        this.collaborators = collaborators;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getRequirementMarkdown() {
        return requirementMarkdown;
    }

    public void setRequirementMarkdown(String requirementMarkdown) {
        this.requirementMarkdown = requirementMarkdown;
    }

    public String getPrototypeUrl() {
        return prototypeUrl;
    }

    public void setPrototypeUrl(String prototypeUrl) {
        this.prototypeUrl = prototypeUrl;
    }

    public String getModuleName() {
        return moduleName;
    }

    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }

    public boolean isDevPassed() {
        return devPassed;
    }

    public void setDevPassed(boolean devPassed) {
        this.devPassed = devPassed;
    }

    public boolean isTestPassed() {
        return testPassed;
    }

    public void setTestPassed(boolean testPassed) {
        this.testPassed = testPassed;
    }

    public BigDecimal getWorkHours() {
        return workHours;
    }

    public void setWorkHours(BigDecimal workHours) {
        this.workHours = workHours;
    }

    public LocalDate getPlanStartDate() {
        return planStartDate;
    }

    public void setPlanStartDate(LocalDate planStartDate) {
        this.planStartDate = planStartDate;
    }

    public LocalDate getPlanEndDate() {
        return planEndDate;
    }

    public void setPlanEndDate(LocalDate planEndDate) {
        this.planEndDate = planEndDate;
    }

    public LocalDateTime getOverdueNotifiedAt() {
        return overdueNotifiedAt;
    }

    public void setOverdueNotifiedAt(LocalDateTime overdueNotifiedAt) {
        this.overdueNotifiedAt = overdueNotifiedAt;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public UserEntity getCreatorUser() {
        return creatorUser;
    }

    public void setCreatorUser(UserEntity creatorUser) {
        this.creatorUser = creatorUser;
    }

    public AgentEntity getAgent() {
        return agent;
    }

    public void setAgent(AgentEntity agent) {
        this.agent = agent;
    }

    public IterationEntity getIteration() {
        return iteration;
    }

    public void setIteration(IterationEntity iteration) {
        this.iteration = iteration;
    }

    public TaskEntity getRequirementTask() {
        return requirementTask;
    }

    public void setRequirementTask(TaskEntity requirementTask) {
        this.requirementTask = requirementTask;
    }
}
