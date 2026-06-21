package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.ProjectWorkItemStatsSummary;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

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
                null,
                null,
                projectId,
                null,
                iterationId,
                null
        );
    }
}
