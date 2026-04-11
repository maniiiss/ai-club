package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DashboardQuickTaskSummary;
import com.aiclub.platform.dto.request.SaveDashboardQuickTaskItemRequest;
import com.aiclub.platform.dto.request.SaveDashboardQuickTasksRequest;
import com.aiclub.platform.repository.UserDashboardQuickTaskRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 覆盖首页快捷任务的账号隔离、排序持久化和增删改场景，避免后续回归。
 */
@SpringBootTest
@Transactional
class DashboardQuickTaskServiceIntegrationTests {

    @Autowired
    private DashboardQuickTaskService dashboardQuickTaskService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserDashboardQuickTaskRepository userDashboardQuickTaskRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 保存快捷任务时应保留旧任务ID、支持新增删除，并按提交顺序持久化。
     */
    @Test
    void shouldSaveQuickTasksWithStableIdsAndLatestOrder() {
        UserEntity user = createUser("dashboard-note-a", "看板用户A");
        loginAs(user);

        List<DashboardQuickTaskSummary> firstSave = dashboardQuickTaskService.saveCurrentUserQuickTasks(
                new SaveDashboardQuickTasksRequest(List.of(
                        new SaveDashboardQuickTaskItemRequest(null, "draft-a", "整理今天的接口联调问题", false),
                        new SaveDashboardQuickTaskItemRequest(null, "draft-b", "补首页演示数据截图", true)
                ))
        );

        assertThat(firstSave).hasSize(2);
        Long firstTaskId = firstSave.get(0).id();
        Long secondTaskId = firstSave.get(1).id();
        assertThat(firstTaskId).isNotNull();
        assertThat(secondTaskId).isNotNull();

        List<DashboardQuickTaskSummary> secondSave = dashboardQuickTaskService.saveCurrentUserQuickTasks(
                new SaveDashboardQuickTasksRequest(List.of(
                        new SaveDashboardQuickTaskItemRequest(secondTaskId, "draft-b", "补首页演示数据截图", false),
                        new SaveDashboardQuickTaskItemRequest(null, "draft-c", "确认周一晨会要讲的事项", false)
                ))
        );

        assertThat(secondSave).hasSize(2);
        assertThat(secondSave.get(0).id()).isEqualTo(secondTaskId);
        assertThat(secondSave.get(0).sortOrder()).isEqualTo(0);
        assertThat(secondSave.get(0).checked()).isFalse();
        assertThat(secondSave.get(1).id()).isNotNull().isNotEqualTo(firstTaskId);
        assertThat(secondSave.get(1).content()).isEqualTo("确认周一晨会要讲的事项");
        assertThat(userDashboardQuickTaskRepository.findAllByUser_IdOrderBySortOrderAscIdAsc(user.getId()))
                .extracting("id")
                .containsExactly(secondSave.get(0).id(), secondSave.get(1).id());
    }

    /**
     * 快捷任务必须严格隔离到当前账号，不能借ID覆盖其他用户的数据。
     */
    @Test
    void shouldIsolateQuickTasksByCurrentUser() {
        UserEntity firstUser = createUser("dashboard-note-b1", "看板用户B1");
        UserEntity secondUser = createUser("dashboard-note-b2", "看板用户B2");

        loginAs(firstUser);
        DashboardQuickTaskSummary firstUserTask = dashboardQuickTaskService.saveCurrentUserQuickTasks(
                new SaveDashboardQuickTasksRequest(List.of(
                        new SaveDashboardQuickTaskItemRequest(null, "first-user", "用户一自己的临时笔记", false)
                ))
        ).get(0);

        loginAs(secondUser);
        dashboardQuickTaskService.saveCurrentUserQuickTasks(
                new SaveDashboardQuickTasksRequest(List.of(
                        new SaveDashboardQuickTaskItemRequest(null, "second-user", "用户二自己的临时笔记", false)
                ))
        );

        assertThat(dashboardQuickTaskService.listCurrentUserQuickTasks())
                .extracting(DashboardQuickTaskSummary::content)
                .containsExactly("用户二自己的临时笔记");

        assertThatThrownBy(() -> dashboardQuickTaskService.saveCurrentUserQuickTasks(
                new SaveDashboardQuickTasksRequest(List.of(
                        new SaveDashboardQuickTaskItemRequest(firstUserTask.id(), "illegal-user", "尝试覆盖他人笔记", false)
                ))
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("快捷任务不存在或无权访问");
    }

    /**
     * 创建最小可用的测试用户。
     */
    private UserEntity createUser(String username, String nickname) {
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        return userRepository.save(user);
    }

    /**
     * 切换当前线程的登录态，模拟当前用户操作自己的快捷任务。
     */
    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                Set.of(),
                Set.of("dashboard:view")
        ));
    }
}
