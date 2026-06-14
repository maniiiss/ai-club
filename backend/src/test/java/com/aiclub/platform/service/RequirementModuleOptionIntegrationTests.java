package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectRequirementModuleOptionSummary;
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
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖项目级需求模块候选的持久化、删除与历史数据回填场景，
 * 避免“所属模块”下拉在项目维度出现串数据或删除后自动回补。
 */
@SpringBootTest
@Transactional
class RequirementModuleOptionIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private RequirementModuleOptionService requirementModuleOptionService;

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
     * Flyway 迁移需要把历史需求中的模块名回填成项目级候选，
     * 同时去重并过滤空值与“未分类”。
     */
    @Test
    void shouldBackfillHistoricalRequirementModulesFromMigration() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:requirement_module_migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE");
        dataSource.setUser("sa");
        dataSource.setPassword("");
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);

        jdbcTemplate.execute("""
                CREATE TABLE project_info (
                    id BIGSERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE task_info (
                    id BIGSERIAL PRIMARY KEY,
                    project_id BIGINT NOT NULL,
                    work_item_type VARCHAR(20) NOT NULL DEFAULT '任务',
                    module_name VARCHAR(120) NOT NULL DEFAULT '',
                    CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
                )
                """);

        jdbcTemplate.update("INSERT INTO project_info (id, name) VALUES (?, ?)", 1L, "项目A");
        jdbcTemplate.update("INSERT INTO project_info (id, name) VALUES (?, ?)", 2L, "项目B");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 1L, "需求", "Alpha");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 1L, "需求", "Alpha");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 1L, "需求", "");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 1L, "需求", "未分类");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 1L, "任务", "TaskOnly");
        jdbcTemplate.update("INSERT INTO task_info (project_id, work_item_type, module_name) VALUES (?, ?, ?)", 2L, "需求", "Beta");

        jdbcTemplate.execute("""
                CREATE TABLE project_requirement_module_option (
                    id BIGSERIAL PRIMARY KEY,
                    project_id BIGINT NOT NULL,
                    module_name VARCHAR(120) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_project_requirement_module_option_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
                    CONSTRAINT uk_project_requirement_module_option_project_module UNIQUE (project_id, module_name)
                )
                """);
        jdbcTemplate.execute("""
                CREATE INDEX idx_project_requirement_module_option_project
                    ON project_requirement_module_option(project_id, module_name)
                """);
        jdbcTemplate.execute("""
                INSERT INTO project_requirement_module_option (project_id, module_name)
                SELECT source.project_id, source.module_name
                FROM (
                    SELECT DISTINCT project_id, TRIM(module_name) AS module_name
                    FROM task_info
                    WHERE work_item_type = '需求'
                      AND module_name IS NOT NULL
                      AND TRIM(module_name) <> ''
                      AND TRIM(module_name) <> '未分类'
                ) source
                """);

        List<String> results = jdbcTemplate.query(
                "SELECT project_id, module_name FROM project_requirement_module_option ORDER BY project_id ASC, module_name ASC",
                (rs, rowNum) -> rs.getLong("project_id") + ":" + rs.getString("module_name")
        );

        assertThat(results).containsExactly("1:Alpha", "2:Beta");
    }

    /**
     * 新建需求时，自定义模块应自动沉淀为当前项目的候选项。
     */
    @Test
    void shouldAddModuleOptionWhenRequirementCreated() {
        UserEntity creator = createUser("creator-module-a", "模块创建人甲");
        UserEntity owner = createUser("owner-module-a", "模块负责人甲");
        ProjectEntity project = createProjectAs(creator, owner, "模块项目A");

        loginAs(creator);
        platformStoreService.createTask(buildRequirementTaskRequest("需求A", project.getId(), "Alpha"));

        List<ProjectRequirementModuleOptionSummary> options = requirementModuleOptionService.listProjectRequirementModules(project.getId());
        assertThat(options).extracting(ProjectRequirementModuleOptionSummary::moduleName).containsExactly("Alpha");
    }

    /**
     * 编辑需求切换模块时，只追加新模块候选，不清理历史候选。
     */
    @Test
    void shouldAddModuleOptionWhenRequirementModuleChanged() {
        UserEntity creator = createUser("creator-module-b", "模块创建人乙");
        UserEntity owner = createUser("owner-module-b", "模块负责人乙");
        ProjectEntity project = createProjectAs(creator, owner, "模块项目B");

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(buildRequirementTaskRequest("需求B", project.getId(), "Alpha"));

        TaskSummary updated = platformStoreService.updateTask(created.id(), buildRequirementTaskRequest(
                created,
                project.getId(),
                "Beta",
                "草稿"
        ));

        List<ProjectRequirementModuleOptionSummary> options = requirementModuleOptionService.listProjectRequirementModules(project.getId());
        assertThat(updated.moduleName()).isEqualTo("Beta");
        assertThat(options).extracting(ProjectRequirementModuleOptionSummary::moduleName)
                .containsExactlyInAnyOrder("Alpha", "Beta");
    }

    /**
     * 删除候选项只影响下拉来源，不回写历史需求的模块事实。
     */
    @Test
    void shouldDeleteCandidateWithoutChangingHistoricalRequirement() {
        UserEntity creator = createUser("creator-module-c", "模块创建人丙");
        UserEntity owner = createUser("owner-module-c", "模块负责人丙");
        ProjectEntity project = createProjectAs(creator, owner, "模块项目C");

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(buildRequirementTaskRequest("需求C", project.getId(), "Alpha"));
        ProjectRequirementModuleOptionSummary option = requirementModuleOptionService.listProjectRequirementModules(project.getId()).get(0);

        requirementModuleOptionService.deleteProjectRequirementModule(project.getId(), option.id());

        TaskEntity savedTask = taskRepository.findById(created.id()).orElseThrow();
        assertThat(savedTask.getModuleName()).isEqualTo("Alpha");
        assertThat(requirementModuleOptionService.listProjectRequirementModules(project.getId())).isEmpty();
    }

    /**
     * 删除候选后，如果只是保存该需求的其他字段，不应把已删除候选自动补回。
     */
    @Test
    void shouldNotReAddDeletedOptionWhenRequirementModuleUnchanged() {
        UserEntity creator = createUser("creator-module-d", "模块创建人丁");
        UserEntity owner = createUser("owner-module-d", "模块负责人丁");
        ProjectEntity project = createProjectAs(creator, owner, "模块项目D");

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(buildRequirementTaskRequest("需求D", project.getId(), "Alpha"));
        ProjectRequirementModuleOptionSummary option = requirementModuleOptionService.listProjectRequirementModules(project.getId()).get(0);
        requirementModuleOptionService.deleteProjectRequirementModule(project.getId(), option.id());

        platformStoreService.updateTask(created.id(), buildRequirementTaskRequest(
                created,
                project.getId(),
                "Alpha",
                "草稿"
        ));

        assertThat(requirementModuleOptionService.listProjectRequirementModules(project.getId())).isEmpty();
    }

    /**
     * 需求原型链接改为选填后，草稿创建与提交更新都不应再因空链接被拒绝。
     */
    @Test
    void shouldAllowRequirementWithoutPrototypeUrl() {
        UserEntity creator = createUser("creator-module-f", "模块创建人己");
        UserEntity owner = createUser("owner-module-f", "模块负责人己");
        ProjectEntity project = createProjectAs(creator, owner, "模块项目F");

        loginAs(creator);
        TaskSummary created = platformStoreService.createTask(new TaskRequest(
                "需求F",
                "需求",
                "草稿",
                "中",
                "",
                null,
                List.of(),
                "需求F 的描述",
                """
                        ## 用户故事

                        作为项目成员，我希望查看当前需求。

                        ## 需求描述

                        需要展示 需求F 的详情内容。

                        ## 验收标准

                        1. 能正常打开页面。
                        2. 页面内容完整显示。
                        """,
                "",
                "Alpha",
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

        TaskSummary updated = platformStoreService.updateTask(created.id(), new TaskRequest(
                created.name(),
                created.workItemType(),
                "待开始",
                created.priority(),
                created.assignee(),
                created.assigneeUserId(),
                created.collaboratorUserIds(),
                created.description(),
                created.requirementMarkdown(),
                "",
                created.moduleName(),
                true,
                true,
                created.workHours(),
                created.planStartDate(),
                created.planEndDate(),
                project.getId(),
                created.agentId(),
                created.iterationId(),
                created.requirementTaskId()
        ));

        assertThat(created.prototypeUrl()).isEmpty();
        assertThat(updated.prototypeUrl()).isEmpty();
        assertThat(updated.status()).isEqualTo("待开始");
    }

    /**
     * 模块候选按项目隔离，避免不同项目的下拉数据串联。
     */
    @Test
    void shouldIsolateModuleOptionsAcrossProjects() {
        UserEntity creator = createUser("creator-module-e", "模块创建人戊");
        UserEntity ownerA = createUser("owner-module-ea", "模块负责人戊甲");
        UserEntity ownerB = createUser("owner-module-eb", "模块负责人戊乙");
        ProjectEntity projectA = createProjectAs(creator, ownerA, "模块项目E-A");
        ProjectEntity projectB = createProjectAs(creator, ownerB, "模块项目E-B");

        loginAs(creator);
        platformStoreService.createTask(buildRequirementTaskRequest("需求E1", projectA.getId(), "Alpha"));
        platformStoreService.createTask(buildRequirementTaskRequest("需求E2", projectB.getId(), "Beta"));

        assertThat(requirementModuleOptionService.listProjectRequirementModules(projectA.getId()))
                .extracting(ProjectRequirementModuleOptionSummary::moduleName)
                .containsExactly("Alpha");
        assertThat(requirementModuleOptionService.listProjectRequirementModules(projectB.getId()))
                .extracting(ProjectRequirementModuleOptionSummary::moduleName)
                .containsExactly("Beta");
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

    private TaskRequest buildRequirementTaskRequest(String name, Long projectId, String moduleName) {
        return new TaskRequest(
                name,
                "需求",
                "草稿",
                "中",
                "",
                null,
                List.of(),
                name + " 的描述",
                """
                        ## 用户故事

                        作为项目成员，我希望查看当前需求。

                        ## 需求描述

                        需要展示 %s 的详情内容。

                        ## 验收标准

                        1. 能正常打开页面。
                        2. 页面内容完整显示。
                        """.formatted(name),
                "https://prototype.example.com/" + name,
                moduleName,
                false,
                false,
                null,
                null,
                null,
                projectId,
                null,
                null,
                null
        );
    }

    private TaskRequest buildRequirementTaskRequest(TaskSummary task,
                                                    Long projectId,
                                                    String moduleName,
                                                    String status) {
        return new TaskRequest(
                task.name(),
                task.workItemType(),
                status,
                task.priority(),
                task.assignee(),
                task.assigneeUserId(),
                task.collaboratorUserIds(),
                task.description(),
                task.requirementMarkdown(),
                task.prototypeUrl(),
                moduleName,
                task.devPassed(),
                task.testPassed(),
                task.workHours(),
                task.planStartDate(),
                task.planEndDate(),
                projectId,
                task.agentId(),
                task.iterationId(),
                task.requirementTaskId()
        );
    }
}
