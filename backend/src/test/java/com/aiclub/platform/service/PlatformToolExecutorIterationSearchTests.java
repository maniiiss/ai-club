package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.ProjectRepository;
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
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证平台工具在迭代场景下搜索工作项时，会正确按 iterationId 收敛结果范围。
 */
@SpringBootTest
@Transactional
class PlatformToolExecutorIterationSearchTests {

    @Autowired
    private PlatformToolExecutor platformToolExecutor;

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldFilterWorkItemsByIterationId() {
        UserEntity creator = createUser("tool-iteration-creator", "工具迭代创建人");
        UserEntity owner = createUser("tool-iteration-owner", "工具迭代负责人");
        ProjectEntity project = createProjectAs(creator, owner, "工具过滤项目");

        loginAs(creator);
        IterationSummary targetIteration = platformStoreService.createIteration(project.getId(), new IterationRequest(
                "目标迭代",
                "用于验证过滤",
                "进行中",
                "2026-04-01",
                "2026-04-15",
                "只返回当前迭代工作项",
                1
        ));
        IterationSummary otherIteration = platformStoreService.createIteration(project.getId(), new IterationRequest(
                "其他迭代",
                "用于对照",
                "进行中",
                "2026-04-16",
                "2026-04-30",
                "不应出现在结果里",
                2
        ));

        platformStoreService.createTask(new TaskRequest(
                "当前迭代需求",
                "需求",
                "已完成",
                "高",
                "",
                null,
                List.of(),
                "目标迭代中的工作项",
                """
                # 用户故事

                作为项目成员，我希望当前迭代需求可以被准确筛出。

                # 需求描述

                仅返回目标迭代里的需求项。

                # 验收标准

                带上 iterationId 搜索时不会混入其他迭代工作项。
                """,
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                targetIteration.id(),
                null
        ));
        platformStoreService.createTask(new TaskRequest(
                "其他迭代缺陷",
                "缺陷",
                "处理中",
                "中",
                "",
                null,
                List.of(),
                "不应命中",
                "",
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                otherIteration.id(),
                null
        ));

        PlatformToolResult result = platformToolExecutor.execute(new PlatformToolRequest(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "TEST",
                "scope-iteration-filter",
                project.getId(),
                null,
                null,
                Map.of("projectId", project.getId(), "iterationId", targetIteration.id())
        ));

        assertThat(result.candidates()).hasSize(1);
        assertThat(result.candidates().get(0).title()).contains("当前迭代需求");
        assertThat(result.metadata()).containsEntry("iterationId", targetIteration.id());
    }

    @Test
    void shouldFilterWorkItemsByStatusForHermesStatusQuestions() {
        UserEntity creator = createUser("tool-status-creator", "工具状态创建人");
        UserEntity owner = createUser("tool-status-owner", "工具状态负责人");
        ProjectEntity project = createProjectAs(creator, owner, "工具状态项目");

        loginAs(creator);
        IterationSummary iteration = platformStoreService.createIteration(project.getId(), new IterationRequest(
                "状态过滤迭代",
                "用于验证状态过滤",
                "进行中",
                "2026-05-01",
                "2026-05-15",
                "只返回指定状态工作项",
                1
        ));

        platformStoreService.createTask(new TaskRequest(
                "进行中的执行任务",
                "任务",
                "进行中",
                "高",
                "",
                null,
                List.of(),
                "当前仍在处理中",
                "",
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                iteration.id(),
                null
        ));
        platformStoreService.createTask(new TaskRequest(
                "已经完成的执行任务",
                "任务",
                "已完成",
                "中",
                "",
                null,
                List.of(),
                "已经完成，不应计入进行中",
                "",
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                iteration.id(),
                null
        ));

        PlatformToolResult result = platformToolExecutor.execute(new PlatformToolRequest(
                PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH,
                "TEST",
                "scope-status-filter",
                project.getId(),
                null,
                null,
                Map.of("projectId", project.getId(), "iterationId", iteration.id(), "workItemType", "任务", "status", "进行中")
        ));

        assertThat(result.candidates()).hasSize(1);
        assertThat(result.candidates().get(0).title()).contains("进行中的执行任务");
        assertThat(result.metadata()).containsEntry("status", "进行中");
    }

    @Test
    void shouldReturnIterationDetailForCurrentIterationSummary() {
        UserEntity creator = createUser("tool-iteration-detail-creator", "迭代详情创建人");
        UserEntity owner = createUser("tool-iteration-detail-owner", "迭代详情负责人");
        ProjectEntity project = createProjectAs(creator, owner, "迭代详情项目");

        loginAs(creator);
        IterationSummary iteration = platformStoreService.createIteration(project.getId(), new IterationRequest(
                "发版迭代",
                "验证迭代详情工具",
                "进行中",
                "2026-04-01",
                "2026-04-20",
                "生成结构化发版事实",
                1
        ));
        platformStoreService.createTask(new TaskRequest(
                "登录统一改造",
                "需求",
                "已完成",
                "高",
                "",
                null,
                List.of(),
                "需求已交付",
                """
                # 用户故事

                作为业务用户，我希望统一登录顺利上线。

                # 需求描述

                完成统一登录相关改造。

                # 验收标准

                登录改造已通过验收。
                """,
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                iteration.id(),
                null
        ));
        platformStoreService.createTask(new TaskRequest(
                "修复移动端按钮错位",
                "缺陷",
                "处理中",
                "中",
                "",
                null,
                List.of(),
                "缺陷待继续处理",
                "",
                "",
                "",
                false,
                false,
                null,
                null,
                null,
                project.getId(),
                null,
                iteration.id(),
                null
        ));

        PlatformToolResult result = platformToolExecutor.execute(new PlatformToolRequest(
                PlatformToolRegistry.TOOL_PROJECT_GET_ITERATION_DETAIL,
                "TEST",
                "scope-iteration-detail",
                project.getId(),
                null,
                null,
                Map.of("projectId", project.getId(), "iterationId", iteration.id())
        ));

        assertThat(result.candidates()).hasSize(1);
        assertThat(result.summary()).contains("发版迭代");
        assertThat(result.summary()).contains("2 个工作项");
        assertThat(result.candidates().get(0).payload()).containsEntry("requirementCount", 1L);
        assertThat(result.candidates().get(0).payload()).containsEntry("defectCount", 1L);
        assertThat(result.candidates().get(0).payload()).containsEntry("deliveredCount", 1L);
        assertThat(result.metadata()).containsEntry("iterationId", iteration.id());
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity role = new RoleEntity();
        role.setName("ROLE_" + username.toUpperCase());
        role.setCode("ROLE_" + username.toUpperCase());
        role.setEnabled(true);
        role.setDescription(username + " 的默认角色");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        RoleEntity savedRole = roleRepository.save(role);

        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(savedRole)));
        return userRepository.save(user);
    }

    private ProjectEntity createProjectAs(UserEntity creator, UserEntity owner, String name) {
        loginAs(creator);
        Long projectId = platformStoreService.createProject(new ProjectRequest(
                name,
                "",
                owner.getId(),
                List.of(),
                "进行中",
                name + " 的说明"
        )).id();
        return projectRepository.findById(projectId).orElseThrow();
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                Set.of(user.getRoles().stream().findFirst().orElseThrow().getCode()),
                Set.of("project:view", "task:view", "task:manage", "hermes:chat")
        ));
    }
}
