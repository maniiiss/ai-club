package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskCommentRequest;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 工作项更新记录集成测试。
 * 业务意图：确保只有实际编辑和协作动作进入历史，工作项创建及无变化保存不制造噪声记录。
 */
@SpringBootTest
@Transactional
class TaskUpdateRecordIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldRecordOnlyChangedFieldsAfterCreation() {
        UserEntity creator = createUser("update-record-creator", "记录创建人");
        ProjectEntity project = createProjectAs(creator, "更新记录项目");
        loginAs(creator);

        TaskSummary created = platformStoreService.createTask(new TaskRequest(
                "原始工作项",
                "任务",
                "待开始",
                "中",
                "",
                null,
                List.of(),
                "原始描述",
                "",
                "",
                "",
                false,
                false,
                null,
                "开发任务",
                null,
                null,
                project.getId(),
                null,
                null,
                null
        ));

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record where task_id = ?",
                Long.class,
                created.id()
        )).isEqualTo(0L);

        TaskSummary updated = platformStoreService.updateTask(created.id(), new TaskRequest(
                created.name(),
                created.workItemType(),
                "进行中",
                created.priority(),
                created.assignee(),
                created.assigneeUserId(),
                created.collaboratorUserIds(),
                "更新后的描述",
                created.requirementMarkdown(),
                created.prototypeUrl(),
                created.moduleName(),
                created.devPassed(),
                created.testPassed(),
                created.workHours(),
                created.taskType(),
                created.planStartDate(),
                created.planEndDate(),
                created.projectId(),
                created.agentId(),
                created.iterationId(),
                created.requirementTaskId()
        ));

        assertThat(updated.status()).isEqualTo("进行中");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record where task_id = ?",
                Long.class,
                created.id()
        )).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record_detail d join task_update_record r on r.id = d.record_id where r.task_id = ? and r.action_type = 'UPDATE'",
                Long.class,
                created.id()
        )).isEqualTo(2L);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record_detail d join task_update_record r on r.id = d.record_id where r.task_id = ? and d.field_code = 'status' and d.old_value = '待开始' and d.new_value = '进行中'",
                Long.class,
                created.id()
        )).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record_detail d join task_update_record r on r.id = d.record_id where r.task_id = ? and d.field_code = 'description' and d.old_value = '原始描述' and d.new_value = '更新后的描述'",
                Long.class,
                created.id()
        )).isEqualTo(1L);

        assertThat(platformStoreService.pageTaskUpdateRecords(created.id(), 1, 1).total()).isEqualTo(1L);
        assertThat(platformStoreService.pageTaskUpdateRecords(created.id(), 1, 1).records().get(0).actionType())
                .isEqualTo("UPDATE");

        platformStoreService.createTaskComment(created.id(), new TaskCommentRequest("独立评论"));

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record where task_id = ?",
                Long.class,
                created.id()
        )).isEqualTo(1L);

        jdbcTemplate.update(
                "insert into task_update_record (task_id, operator_name_snapshot, source, action_type, summary, created_at) values (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                created.id(), "记录创建人", "MANUAL", "COMMENT", "历史评论"
        );
        assertThat(platformStoreService.pageTaskUpdateRecords(created.id(), 1, 10).total()).isEqualTo(1L);

        platformStoreService.updateTask(created.id(), new TaskRequest(
                updated.name(), updated.workItemType(), updated.status(), updated.priority(), updated.assignee(),
                updated.assigneeUserId(), updated.collaboratorUserIds(), updated.description(), updated.requirementMarkdown(),
                updated.prototypeUrl(), updated.moduleName(), updated.devPassed(), updated.testPassed(), updated.workHours(),
                updated.taskType(), updated.planStartDate(), updated.planEndDate(), updated.projectId(), updated.agentId(),
                updated.iterationId(), updated.requirementTaskId()
        ));

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from task_update_record where task_id = ?",
                Long.class,
                created.id()
        )).isEqualTo(2L);
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity role = new RoleEntity();
        role.setName("ROLE_" + username.toUpperCase());
        role.setCode("ROLE_" + username.toUpperCase());
        role.setEnabled(true);
        role.setDescription("工作项更新记录测试角色");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        roleRepository.save(role);

        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(role)));
        return userRepository.save(user);
    }

    private ProjectEntity createProjectAs(UserEntity creator, String name) {
        loginAs(creator);
        ProjectSummary summary = platformStoreService.createProject(new ProjectRequest(
                name, "", creator.getId(), List.of(), "进行中", name + " 描述"
        ));
        return projectRepository.findById(summary.id()).orElseThrow();
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(), user.getUsername(), user.getNickname(),
                user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toSet()), Set.of()
        ));
    }
}
