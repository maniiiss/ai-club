package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.IterationRequest;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 Hermes 上下文装配在首页、任务和无权限回退场景下都能输出稳定结果。
 */
@SpringBootTest
@Transactional
class HermesContextAssemblerTests {

    @Autowired
    private HermesContextAssembler hermesContextAssembler;

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

    /**
     * 首页场景应聚合为 dashboard 上下文，并给出首页导向的快捷问题。
     */
    @Test
    void shouldBuildDashboardContext() {
        UserEntity user = createUser("hermes-dashboard", "首页成员");
        loginAs(user);

        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(
                new HermesChatRequest("我今天最该推进什么", "dashboard", null, null, null, null, null, null, null),
                toCurrentUserInfo(user)
        );

        assertThat(context.sceneCode()).isEqualTo("dashboard");
        assertThat(context.references()).extracting(reference -> reference.type()).contains("DASHBOARD");
        assertThat(context.suggestions()).contains("我今天最该推进什么");
        assertThat(context.contextMarkdown()).contains("首页看板");
    }

    /**
     * 任务场景应输出任务详情、项目信息和评论摘要，供 Hermes 进行任务级回答。
     */
    @Test
    void shouldBuildTaskContextWithTaskDetails() {
        UserEntity creator = createUser("hermes-task-creator", "任务创建人");
        UserEntity owner = createUser("hermes-task-owner", "项目负责人");
        ProjectEntity project = createProjectAs(creator, owner, "Hermes 项目");

        loginAs(creator);
        TaskSummary task = platformStoreService.createTask(new TaskRequest(
                "Hermes 任务",
                "任务",
                "处理中",
                "高",
                "",
                null,
                List.of(),
                "需要回顾最近的处理进度",
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
                null,
                null
        ));
        platformStoreService.createTaskComment(task.id(), new TaskCommentRequest("上游接口返回字段仍未稳定"));

        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(
                new HermesChatRequest("这个任务为什么延期了", "project-iterations", project.getId(), task.id(), null, null, null, null, null),
                toCurrentUserInfo(creator)
        );

        assertThat(context.sceneCode()).isEqualTo("task");
        assertThat(context.projectId()).isEqualTo(project.getId());
        assertThat(context.taskId()).isEqualTo(task.id());
        assertThat(context.references()).extracting(reference -> reference.type()).contains("TASK", "PROJECT");
        assertThat(context.contextMarkdown()).contains("Hermes 任务");
        assertThat(context.contextMarkdown()).contains("上游接口返回字段仍未稳定");
    }

    /**
     * 迭代详情页应优先装配当前迭代摘要，便于 Hermes 直接生成发版内容、需求和缺陷统计。
     */
    @Test
    void shouldBuildIterationContextWithReleaseSummary() {
        UserEntity creator = createUser("hermes-iteration-creator", "迭代创建人");
        UserEntity owner = createUser("hermes-iteration-owner", "迭代负责人");
        ProjectEntity project = createProjectAs(creator, owner, "发版项目");

        loginAs(creator);
        IterationSummary iteration = platformStoreService.createIteration(project.getId(), new IterationRequest(
                "2026.04 发版迭代",
                "聚焦本月发版收口",
                "进行中",
                "2026-04-01",
                "2026-04-30",
                "覆盖需求交付与缺陷修复",
                1
        ));
        platformStoreService.createTask(new TaskRequest(
                "统一登录改造",
                "需求",
                "通过",
                "高",
                "",
                null,
                List.of(),
                "完成统一登录发版准备",
                """
                # 用户故事

                作为发版负责人，我希望统一登录能力可以按计划上线。

                # 需求描述

                完成统一登录改造并通过发版验收。

                # 验收标准

                统一登录改造通过联调与回归验证。
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
                "修复发版前移动端展示问题",
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

        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(
                new HermesChatRequest("帮我总结这个迭代的发版内容", "project-iterations", project.getId(), null, iteration.id(), null, null, null, null),
                toCurrentUserInfo(creator)
        );

        assertThat(context.sceneCode()).isEqualTo("project-iterations");
        assertThat(context.projectId()).isEqualTo(project.getId());
        assertThat(context.references()).extracting(reference -> reference.type()).contains("PROJECT", "ITERATION", "TASK");
        assertThat(context.contextMarkdown()).contains("当前迭代");
        assertThat(context.contextMarkdown()).contains("发版内容速览");
        assertThat(context.contextMarkdown()).contains("需求：1");
        assertThat(context.contextMarkdown()).contains("缺陷：1");
        assertThat(context.contextMarkdown()).contains("2026.04 发版迭代");
    }

    /**
     * 当用户无权访问指定任务时，应自动回退为全局助手，避免泄露项目数据。
     */
    @Test
    void shouldFallbackToGlobalContextWhenTaskIsNotVisible() {
        UserEntity creator = createUser("hermes-hidden-creator", "隐藏创建人");
        UserEntity owner = createUser("hermes-hidden-owner", "隐藏负责人");
        UserEntity outsider = createUser("hermes-outsider", "旁观者");
        ProjectEntity project = createProjectAs(creator, owner, "隐藏项目");

        loginAs(creator);
        TaskSummary task = platformStoreService.createTask(new TaskRequest(
                "不可见任务",
                "任务",
                "待开始",
                "中",
                "",
                null,
                List.of(),
                "旁观者不应看到这个任务",
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
                null,
                null
        ));

        loginAs(outsider);
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(
                new HermesChatRequest("这个任务现在怎么样", "project-iterations", project.getId(), task.id(), null, null, null, null, null),
                toCurrentUserInfo(outsider)
        );

        assertThat(context.sceneCode()).isEqualTo("global");
        assertThat(context.projectId()).isNull();
        assertThat(context.taskId()).isNull();
        assertThat(context.contextMarkdown()).contains("全局助手");
    }

    /**
     * 测试场景使用的用户需要具备默认项目可见范围，保证与线上默认角色保持一致。
     */
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

    /**
     * 通过现有项目创建流程生成项目，保证成员、创建人和权限边界与真实业务一致。
     */
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
                Set.of("dashboard:view", "project:view", "task:view", "hermes:chat")
        ));
    }

    private CurrentUserInfo toCurrentUserInfo(UserEntity user) {
        return new CurrentUserInfo(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getEmail(),
                user.getPhone(),
                user.getGitlabUsername(),
                user.getAvatarUrl(),
                user.isEnabled(),
                user.getRoles().stream().map(RoleEntity::getCode).toList(),
                user.getRoles().stream().map(RoleEntity::getName).toList(),
                List.of("dashboard:view", "project:view", "task:view", "hermes:chat")
        );
    }
}
