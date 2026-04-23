package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskPrdDetail;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.WikiSpaceDetail;
import com.aiclub.platform.dto.request.ApplyTaskPrdSuggestionRequest;
import com.aiclub.platform.dto.request.CreateWikiSpaceRequest;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.TaskPrdProjectionRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.repository.WikiPageSyncTaskV2Repository;
import com.aiclub.platform.repository.WikiPageVersionV2Repository;
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
 * 覆盖需求工作项 PRD 自动初始化、失败回写、幂等重试与建议稿写回链路。
 */
@SpringBootTest
@Transactional
class TaskPrdServiceIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private TaskPrdService taskPrdService;

    @Autowired
    private WikiSpaceService wikiSpaceService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private TaskPrdProjectionRepository taskPrdProjectionRepository;

    @Autowired
    private WikiPageVersionV2Repository wikiPageVersionV2Repository;

    @Autowired
    private WikiPageSyncTaskV2Repository wikiPageSyncTaskV2Repository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 项目唯一绑定空间存在时，应自动创建 `需求PRD/模块` 目录与主 PRD 页面。
     */
    @Test
    void shouldInitializePrdWhenUniqueBoundSpaceExists() {
        UserEntity creator = createUser("task-prd-creator-a", "创建人甲");
        UserEntity owner = createUser("task-prd-owner-a", "负责人甲");
        ProjectEntity project = createProjectAs(creator, owner, "PRD 项目A");

        loginAs(creator);
        WikiSpaceDetail space = wikiSpaceService.createSpace(new CreateWikiSpaceRequest(
                "PRD 空间A",
                "",
                WikiSpaceService.READ_SCOPE_MEMBERS_ONLY,
                project.getId(),
                WikiSpaceService.MEMBER_SOURCE_MANUAL
        ));

        TaskSummary task = platformStoreService.createTask(buildRequirementTaskRequest(
                "登录页升级",
                project.getId(),
                "账户中心"
        ));

        TaskPrdDetail prdDetail = taskPrdService.getTaskPrd(task.id());
        assertThat(task.moduleName()).isEqualTo("账户中心");
        assertThat(task.prdStatus()).isEqualTo(TaskPrdService.STATUS_READY);
        assertThat(task.prdWikiSpaceId()).isEqualTo(space.id());
        assertThat(task.prdWikiPageId()).isNotNull();
        assertThat(prdDetail.prdWikiDirectoryName()).isEqualTo("账户中心");
        assertThat(prdDetail.prdWikiPageTitle()).isEqualTo(task.workItemCode() + "-" + task.name());
        assertThat(prdDetail.prdWikiPageContent()).contains("## 背景");
        assertThat(prdDetail.prdWikiPageContent()).contains("## 验收标准");
        assertThat(prdDetail.prdWikiPageContent()).contains("taskId=" + task.id());
        assertThat(wikiPageVersionV2Repository.countByPage_Id(prdDetail.prdWikiPageId())).isEqualTo(1);
        assertThat(taskPrdProjectionRepository.findByTask_Id(task.id())).isPresent();
    }

    /**
     * 当项目未绑定唯一空间时，工作项仍应创建成功，并把失败文案回写到 PRD 状态。
     */
    @Test
    void shouldExposeFailedStatusWhenProjectDoesNotHaveUniqueWikiSpace() {
        UserEntity creator = createUser("task-prd-creator-b", "创建人乙");
        UserEntity owner = createUser("task-prd-owner-b", "负责人乙");
        ProjectEntity project = createProjectAs(creator, owner, "PRD 项目B");

        loginAs(creator);
        wikiSpaceService.createSpace(new CreateWikiSpaceRequest(
                "PRD 空间B-1",
                "",
                WikiSpaceService.READ_SCOPE_MEMBERS_ONLY,
                project.getId(),
                WikiSpaceService.MEMBER_SOURCE_MANUAL
        ));
        wikiSpaceService.createSpace(new CreateWikiSpaceRequest(
                "PRD 空间B-2",
                "",
                WikiSpaceService.READ_SCOPE_MEMBERS_ONLY,
                project.getId(),
                WikiSpaceService.MEMBER_SOURCE_MANUAL
        ));

        TaskSummary task = platformStoreService.createTask(buildRequirementTaskRequest(
                "批量导出增强",
                project.getId(),
                ""
        ));

        assertThat(task.moduleName()).isEqualTo("未分类");
        assertThat(task.prdStatus()).isEqualTo(TaskPrdService.STATUS_FAILED);
        assertThat(task.prdStatusMessage()).contains("多个 Wiki 空间");

        TaskPrdDetail prdDetail = taskPrdService.getTaskPrd(task.id());
        assertThat(prdDetail.status()).isEqualTo(TaskPrdService.STATUS_FAILED);
        assertThat(prdDetail.statusMessage()).contains("多个 Wiki 空间");
        assertThat(prdDetail.prdWikiPageId()).isNull();
    }

    /**
     * 重试初始化必须幂等；建议稿写回后应追加新版本并入队同步任务。
     */
    @Test
    void shouldKeepInitializeIdempotentAndAppendVersionWhenApplyingSuggestion() {
        UserEntity creator = createUser("task-prd-creator-c", "创建人丙");
        UserEntity owner = createUser("task-prd-owner-c", "负责人丙");
        ProjectEntity project = createProjectAs(creator, owner, "PRD 项目C");

        loginAs(creator);
        wikiSpaceService.createSpace(new CreateWikiSpaceRequest(
                "PRD 空间C",
                "",
                WikiSpaceService.READ_SCOPE_MEMBERS_ONLY,
                project.getId(),
                WikiSpaceService.MEMBER_SOURCE_MANUAL
        ));

        TaskSummary task = platformStoreService.createTask(buildRequirementTaskRequest(
                "报表筛选增强",
                project.getId(),
                "数据报表"
        ));
        TaskPrdDetail initial = taskPrdService.getTaskPrd(task.id());
        long versionCountBefore = wikiPageVersionV2Repository.countByPage_Id(initial.prdWikiPageId());
        long syncTaskCountBefore = wikiPageSyncTaskV2Repository.count();

        TaskPrdDetail retried = taskPrdService.initialize(task.id());
        assertThat(retried.prdWikiPageId()).isEqualTo(initial.prdWikiPageId());
        assertThat(retried.prdWikiDirectoryId()).isEqualTo(initial.prdWikiDirectoryId());

        taskPrdService.applySuggestion(task.id(), new ApplyTaskPrdSuggestionRequest(
                """
                ## 背景

                报表筛选能力需要支持更细粒度条件组合。

                ## 目标

                为运营人员提供稳定的组合筛选能力。

                ## 用户故事

                作为运营人员，我希望在报表页按多个条件筛选结果，以便快速定位数据。

                ## 需求描述

                页面支持日期、状态和负责人组合筛选，并保留最近一次筛选条件。

                ## 范围与边界

                仅覆盖当前报表详情页，不扩展到导出模板管理。

                ## 验收标准

                1. 支持组合筛选。
                2. 刷新页面后仍可恢复最近一次条件。

                ## 待确认问题

                待完善
                """,
                null
        ));

        TaskPrdDetail updated = taskPrdService.getTaskPrd(task.id());
        assertThat(updated.prdWikiPageId()).isEqualTo(initial.prdWikiPageId());
        assertThat(updated.prdWikiPageContent()).contains("组合筛选");
        assertThat(wikiPageVersionV2Repository.countByPage_Id(initial.prdWikiPageId())).isEqualTo(versionCountBefore + 1);
        assertThat(wikiPageSyncTaskV2Repository.count()).isGreaterThan(syncTaskCountBefore);
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity defaultRole = new RoleEntity();
        defaultRole.setName("ROLE_" + username.toUpperCase());
        defaultRole.setCode("ROLE_" + username.toUpperCase());
        defaultRole.setEnabled(true);
        defaultRole.setDescription(username + " 的默认角色");
        defaultRole.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        defaultRole.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        defaultRole.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        defaultRole.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        RoleEntity savedRole = roleRepository.save(defaultRole);

        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(savedRole)));
        return userRepository.save(user);
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
                """
                ## 用户故事

                作为平台用户，我希望查看 %s 的完整需求。

                ## 需求描述

                需要补充 %s 的详细交互与行为说明。

                ## 验收标准

                1. 页面可以正常展示。
                2. 支持保存并回显。
                """.formatted(name, name),
                """
                ## 用户故事

                作为平台用户，我希望查看 %s 的完整需求。

                ## 需求描述

                需要补充 %s 的详细交互与行为说明。

                ## 验收标准

                1. 页面可以正常展示。
                2. 支持保存并回显。
                """.formatted(name, name),
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
}
