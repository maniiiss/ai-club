package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 覆盖工作项编号、计划时间和创建人展示的核心集成场景，
 * 避免迭代管理新增字段后出现回归。
 */
@SpringBootTest
@Transactional
class TaskWorkItemMetadataIntegrationTests {

    private static final Pattern WORK_ITEM_CODE_PATTERN = Pattern.compile("^#[A-Z0-9]{6}$");

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 新建工作项时应自动生成唯一编号，并把计划时间、创建人名称一并返回给前端。
     */
    @Test
    void shouldGenerateUniqueCodeAndExposeCreatorAndPlanDates() {
        UserEntity creator = createUser("creator-meta-a", "创建人甲");
        UserEntity owner = createUser("owner-meta-a", "负责人甲");
        ProjectEntity project = createProjectAs(creator, owner, "元数据项目A");

        loginAs(creator);
        TaskSummary firstTask = platformStoreService.createTask(buildTaskRequest(
                "工作项A",
                project.getId(),
                "2026-05-01",
                "2026-05-10"
        ));
        TaskSummary secondTask = platformStoreService.createTask(buildTaskRequest(
                "工作项B",
                project.getId(),
                null,
                null
        ));

        assertThat(firstTask.workItemCode()).matches(WORK_ITEM_CODE_PATTERN);
        assertThat(secondTask.workItemCode()).matches(WORK_ITEM_CODE_PATTERN);
        assertThat(firstTask.workItemCode()).isNotEqualTo(secondTask.workItemCode());
        assertThat(firstTask.creatorUserId()).isEqualTo(creator.getId());
        assertThat(firstTask.creatorName()).isEqualTo("创建人甲");
        assertThat(firstTask.planStartDate()).isEqualTo("2026-05-01");
        assertThat(firstTask.planEndDate()).isEqualTo("2026-05-10");

        TaskEntity savedTask = taskRepository.findById(firstTask.id()).orElseThrow();
        assertThat(savedTask.getWorkItemCode()).isEqualTo(firstTask.workItemCode());
    }

    /**
     * 编辑工作项时编号必须保持不变；计划时间顺序非法时应直接拒绝。
     */
    @Test
    void shouldKeepCodeOnUpdateAndRejectInvalidPlanDateRange() {
        UserEntity creator = createUser("creator-meta-b", "创建人乙");
        UserEntity owner = createUser("owner-meta-b", "负责人乙");
        ProjectEntity project = createProjectAs(creator, owner, "元数据项目B");

        loginAs(creator);
        TaskSummary task = platformStoreService.createTask(buildTaskRequest(
                "工作项C",
                project.getId(),
                "2026-06-01",
                "2026-06-15"
        ));

        TaskSummary updated = platformStoreService.updateTask(task.id(), new TaskRequest(
                task.name(),
                task.workItemType(),
                "处理中",
                task.priority(),
                task.assignee(),
                task.assigneeUserId(),
                task.collaboratorUserIds(),
                task.description(),
                task.requirementMarkdown(),
                task.prototypeUrl(),
                task.moduleName(),
                task.devPassed(),
                task.testPassed(),
                task.workHours(),
                "2026-06-03",
                "2026-06-18",
                task.projectId(),
                task.agentId(),
                task.iterationId(),
                task.requirementTaskId()
        ));

        assertThat(updated.workItemCode()).isEqualTo(task.workItemCode());
        assertThat(updated.planStartDate()).isEqualTo("2026-06-03");
        assertThat(updated.planEndDate()).isEqualTo("2026-06-18");

        assertThatThrownBy(() -> platformStoreService.createTask(buildTaskRequest(
                "非法日期工作项",
                project.getId(),
                "2026-07-10",
                "2026-07-01"
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("计划结束日期不能早于计划开始日期");
    }

    /**
     * 任务工时不再依赖关联需求的开发、测试通过状态。
     */
    @Test
    void shouldAllowTaskWorkHoursWithoutRequirementPassGate() {
        UserEntity creator = createUser("creator-meta-c", "创建人丙");
        UserEntity owner = createUser("owner-meta-c", "负责人丙");
        ProjectEntity project = createProjectAs(creator, owner, "元数据项目C");

        loginAs(creator);
        TaskSummary requirement = platformStoreService.createTask(new TaskRequest(
                "关联需求C",
                "需求",
                "草稿",
                "中",
                "",
                null,
                List.of(),
                "需求描述",
                "# 用户故事\n\n用户需要记录工时。\n\n# 需求描述\n\n允许任务直接填写工时。\n\n# 验收标准\n\n任务保存成功。",
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

        TaskSummary task = platformStoreService.createTask(new TaskRequest(
                "关联任务C",
                "任务",
                "待开始",
                "中",
                "",
                null,
                List.of(),
                "任务描述",
                "",
                "",
                "",
                false,
                false,
                new BigDecimal("3.5"),
                null,
                null,
                project.getId(),
                null,
                null,
                requirement.id()
        ));

        assertThat(task.workHours()).isEqualByComparingTo("3.5");
        assertThat(task.requirementTaskId()).isEqualTo(requirement.id());
        assertThat(requirement.devPassed()).isFalse();
        assertThat(requirement.testPassed()).isFalse();
    }

    /**
     * 创建带默认权限角色的测试用户。
     */
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

    /**
     * 创建满足项目管理场景的默认测试角色。
     */
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

    /**
     * 将当前线程切换为指定测试用户登录态。
     */
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
     * 以指定创建人身份创建测试项目。
     */
    private ProjectEntity createProjectAs(UserEntity creator, UserEntity owner, String name) {
        loginAs(creator);
        ProjectSummary summary = platformStoreService.createProject(new ProjectRequest(
                name,
                "",
                owner.getId(),
                List.of(),
                "进行中",
                name + " 的描述"
        ));
        return projectRepository.findById(summary.id()).orElseThrow();
    }

    /**
     * 统一构造任务请求，便于不同测试场景复用计划时间参数。
     */
    private TaskRequest buildTaskRequest(String name, Long projectId, String planStartDate, String planEndDate) {
        return new TaskRequest(
                name,
                "任务",
                "草稿",
                "中",
                "",
                null,
                List.of(),
                name + " 的描述",
                "",
                "",
                "",
                false,
                false,
                null,
                planStartDate,
                planEndDate,
                projectId,
                null,
                null,
                null
        );
    }
}
