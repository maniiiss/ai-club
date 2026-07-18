package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.ProjectWorkItemStatsSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.dto.request.TaskInlineUpdateRequest;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证工作项统计接口按“当前筛选结果”聚合，并复用新的类型化完成态规则。
 */
@SpringBootTest
@Transactional
class ProjectWorkItemStatsIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldAggregateFilteredWorkItemsByCurrentStatusDefinition() {
        UserEntity creator = createUser("creator-stats-a", "统计创建人");
        UserEntity owner = createUser("owner-stats-a", "统计负责人");

        loginAs(creator);
        ProjectSummary project = platformStoreService.createProject(new ProjectRequest(
                "统计项目A",
                "",
                owner.getId(),
                List.of(),
                "进行中",
                "用于验证工作项统计"
        ));
        IterationSummary iteration = platformStoreService.createIteration(project.id(), new IterationRequest(
                "统计迭代A",
                "",
                "进行中",
                "2026-04-01",
                "2026-05-15",
                "统计迭代说明",
                1
        ));

        platformStoreService.createTask(buildTaskRequest("需求完成", "需求", "已完成", project.id(), iteration.id()));
        platformStoreService.createTask(buildTaskRequest("需求草稿", "需求", "草稿", project.id(), iteration.id()));
        platformStoreService.createTask(buildTaskRequest("任务完成", "任务", "已完成", project.id(), iteration.id()));
        platformStoreService.createTask(buildTaskRequest("任务进行中", "任务", "进行中", project.id(), iteration.id()));
        platformStoreService.createTask(buildTaskRequest("缺陷通过", "缺陷", "通过", project.id(), iteration.id()));
        platformStoreService.createTask(buildTaskRequest("缺陷延期", "缺陷", "延期解决", project.id(), null));

        ProjectWorkItemStatsSummary iterationStats = platformStoreService.getProjectWorkItemStats(
                project.id(),
                iteration.id(),
                null,
                "全部",
                null,
                null,
                null,
                null
        );
        assertThat(iterationStats.totalCount()).isEqualTo(5);
        assertThat(iterationStats.completedCount()).isEqualTo(3);
        assertThat(iterationStats.openCount()).isEqualTo(2);
        assertThat(iterationStats.defectCount()).isEqualTo(1);
        assertThat(iterationStats.completionRate()).isEqualTo(60);

        ProjectWorkItemStatsSummary completedStats = platformStoreService.getProjectWorkItemStats(
                project.id(),
                null,
                null,
                "全部",
                null,
                "已完成",
                null,
                null
        );
        assertThat(completedStats.totalCount()).isEqualTo(2);
        assertThat(completedStats.completedCount()).isEqualTo(2);
        assertThat(completedStats.openCount()).isZero();
        assertThat(completedStats.defectCount()).isZero();
        assertThat(completedStats.completionRate()).isEqualTo(100);

        ProjectWorkItemStatsSummary unplannedStats = platformStoreService.getProjectWorkItemStats(
                project.id(),
                null,
                true,
                "全部",
                null,
                null,
                null,
                null
        );
        assertThat(unplannedStats.totalCount()).isEqualTo(1);
        assertThat(unplannedStats.completedCount()).isZero();
        assertThat(unplannedStats.openCount()).isEqualTo(1);
        assertThat(unplannedStats.defectCount()).isEqualTo(1);
        assertThat(unplannedStats.completionRate()).isZero();
    }

    /** 验证修改计划时间后，项目工作项列表仍按创建时间倒序展示。 */
    @Test
    void shouldKeepProjectWorkItemOrderByCreatedTimeAfterUpdatingPlanDates() {
        UserEntity creator = createUser("creator-order-a", "排序创建人");
        loginAs(creator);
        ProjectSummary project = platformStoreService.createProject(new ProjectRequest(
                "排序项目A",
                "",
                creator.getId(),
                List.of(),
                "进行中",
                "用于验证工作项创建时间排序"
        ));

        TaskSummary older = platformStoreService.createTask(buildTaskRequest(
                "较早创建的工作项", "任务", "待开始", project.id(), null
        ));
        TaskSummary newer = platformStoreService.createTask(buildTaskRequest(
                "较晚创建的工作项", "任务", "待开始", project.id(), null
        ));

        platformStoreService.updateTask(older.id(), buildTaskRequest(
                "较早创建的工作项", "任务", "待开始", project.id(), null,
                "2026-07-20", "2026-07-22"
        ));

        PageResponse<TaskSummary> page = platformStoreService.pageProjectWorkItems(
                project.id(), 1, 20, null, null, null, null, null, null, null
        );
        assertThat(page.records()).extracting(TaskSummary::id).containsExactly(newer.id(), older.id());
    }

    /** 验证公众端列表支持服务端字段排序，以及计划时间范围的重叠筛选。 */
    @Test
    void shouldSortAndFilterProjectWorkItemsByAdvancedQuery() {
        UserEntity creator = createUser("creator-filter-a", "高级筛选创建人");
        loginAs(creator);
        ProjectSummary project = platformStoreService.createProject(new ProjectRequest(
                "高级筛选项目A", "", creator.getId(), List.of(), "进行中", "用于验证列表高级筛选"
        ));
        TaskSummary laterName = platformStoreService.createTask(buildTaskRequest(
                "Z 工作项", "任务", "待开始", project.id(), null, "2026-07-20", "2026-07-22"
        ));
        TaskSummary earlierName = platformStoreService.createTask(buildTaskRequest(
                "A 工作项", "任务", "待开始", project.id(), null
        ));

        PageResponse<TaskSummary> sorted = platformStoreService.pageProjectWorkItems(
                project.id(), 1, 20, null, null, null, null, null, null, null,
                null, null, null, null, "name", "asc"
        );
        assertThat(sorted.records()).extracting(TaskSummary::id).containsExactly(earlierName.id(), laterName.id());

        PageResponse<TaskSummary> plannedOnDate = platformStoreService.pageProjectWorkItems(
                project.id(), 1, 20, null, null, null, null, null, null, null,
                null, null, LocalDate.of(2026, 7, 21), LocalDate.of(2026, 7, 21), "createdAt", "desc"
        );
        assertThat(plannedOnDate.records()).extracting(TaskSummary::id).containsExactly(laterName.id());
    }

    /** 验证列表轻量更新只改目标字段，不会覆盖工作项描述。 */
    @Test
    void shouldUpdateInlineFieldWithoutReplacingDescription() {
        UserEntity creator = createUser("creator-inline-a", "列表编辑人");
        loginAs(creator);
        ProjectSummary project = platformStoreService.createProject(new ProjectRequest(
                "列表编辑项目A",
                "",
                creator.getId(),
                List.of(),
                "进行中",
                "用于验证列表轻量更新"
        ));

        TaskSummary created = platformStoreService.createTask(buildTaskRequest(
                "保留描述的工作项", "任务", "待开始", project.id(), null
        ));
        platformStoreService.updateTaskInline(created.id(), new TaskInlineUpdateRequest(
                TaskInlineUpdateRequest.Field.PLAN_DATES,
                null,
                null,
                "2026-07-20",
                "2026-07-22"
        ));

        TaskSummary updated = platformStoreService.getTask(created.id());
        assertThat(updated.description()).isEqualTo(created.description());
        assertThat(updated.planStartDate()).isEqualTo("2026-07-20");
        assertThat(updated.planEndDate()).isEqualTo("2026-07-22");
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity defaultRole = createRole("ROLE_" + username.toUpperCase());
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(defaultRole)));
        return userRepository.save(user);
    }

    private RoleEntity createRole(String code) {
        RoleEntity role = new RoleEntity();
        role.setName(code);
        role.setCode(code);
        role.setEnabled(true);
        role.setDescription(code + " 描述");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        return roleRepository.save(role);
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toSet()),
                Set.of()
        ));
    }

    /**
     * 统一构造测试工作项，请求体中的状态直接走最新主状态定义。
     */
    private TaskRequest buildTaskRequest(String name, String workItemType, String status, Long projectId, Long iterationId) {
        return buildTaskRequest(name, workItemType, status, projectId, iterationId, null, null);
    }

    private TaskRequest buildTaskRequest(String name, String workItemType, String status, Long projectId, Long iterationId,
                                         String planStartDate, String planEndDate) {
        String requirementMarkdown = "需求".equals(workItemType)
                ? """
                # 用户故事

                统计测试用户故事

                # 需求描述

                统计测试需求描述

                # 验收标准

                统计测试验收标准
                """
                : "";
        return new TaskRequest(
                name,
                workItemType,
                status,
                "中",
                "",
                null,
                List.of(),
                name + " 的描述",
                requirementMarkdown,
                "",
                "",
                false,
                false,
                null,
                planStartDate,
                planEndDate,
                projectId,
                null,
                iterationId,
                null
        );
    }
}
