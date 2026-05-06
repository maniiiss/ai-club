package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DashboardShortcutEntryEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DashboardShortcutEntrySummary;
import com.aiclub.platform.dto.DashboardShortcutOverview;
import com.aiclub.platform.dto.request.DashboardShortcutAdminRequest;
import com.aiclub.platform.dto.request.SaveDashboardShortcutEntriesRequest;
import com.aiclub.platform.dto.request.SaveDashboardShortcutEntryItemRequest;
import com.aiclub.platform.repository.DashboardShortcutEntryRepository;
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
 * 覆盖首页快捷入口的系统级与个人级读写行为，避免后续扩展时越权或顺序持久化回归。
 */
@SpringBootTest
@Transactional
class DashboardShortcutEntryServiceIntegrationTests {

    @Autowired
    private DashboardShortcutEntryService dashboardShortcutEntryService;

    @Autowired
    private DashboardShortcutEntryRepository dashboardShortcutEntryRepository;

    @Autowired
    private UserRepository userRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 当前用户保存个人入口时应保留旧入口ID、支持新增删除，并按提交顺序持久化。
     */
    @Test
    void shouldSaveCurrentUserShortcutEntriesWithStableIdsAndLatestOrder() {
        UserEntity user = createUser("dashboard-shortcut-a", "快捷入口用户A");
        loginAs(user);

        List<DashboardShortcutEntrySummary> firstSave = dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(null, "GitLab", "https://gitlab.example.com", "Connection", true),
                        new SaveDashboardShortcutEntryItemRequest(null, "Jenkins", "https://jenkins.example.com", "Promotion", true)
                ))
        );

        Long firstId = firstSave.get(0).id();
        Long secondId = firstSave.get(1).id();
        assertThat(firstSave).hasSize(2);
        assertThat(firstId).isNotNull();
        assertThat(secondId).isNotNull();

        List<DashboardShortcutEntrySummary> secondSave = dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(secondId, "Jenkins 平台", "https://jenkins.example.com", "Promotion", true),
                        new SaveDashboardShortcutEntryItemRequest(null, "禅道", "https://zentao.example.com", "Tickets", true)
                ))
        );

        assertThat(secondSave).hasSize(2);
        assertThat(secondSave.get(0).id()).isEqualTo(secondId);
        assertThat(secondSave.get(0).name()).isEqualTo("Jenkins 平台");
        assertThat(secondSave.get(0).sortOrder()).isEqualTo(0);
        assertThat(secondSave.get(1).name()).isEqualTo("禅道");
        assertThat(secondSave.get(1).id()).isNotNull().isNotEqualTo(firstId);
        assertThat(dashboardShortcutEntryRepository.findAllByScopeTypeAndOwnerUser_IdOrderBySortOrderAscIdAsc(DashboardShortcutEntryService.SCOPE_USER, user.getId()))
                .extracting("id")
                .containsExactly(secondSave.get(0).id(), secondSave.get(1).id());
    }

    /**
     * 个人入口必须严格隔离到当前账号，不能借ID覆盖其他用户的数据。
     */
    @Test
    void shouldIsolateShortcutEntriesByCurrentUser() {
        UserEntity firstUser = createUser("dashboard-shortcut-b1", "快捷入口用户B1");
        UserEntity secondUser = createUser("dashboard-shortcut-b2", "快捷入口用户B2");

        loginAs(firstUser);
        DashboardShortcutEntrySummary firstUserEntry = dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(null, "用户一入口", "https://user-one.example.com", "Link", true)
                ))
        ).get(0);

        loginAs(secondUser);
        dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(null, "用户二入口", "https://user-two.example.com", "Link", true)
                ))
        );

        assertThat(dashboardShortcutEntryService.listCurrentUserEntries())
                .extracting(DashboardShortcutEntrySummary::name)
                .containsExactly("用户二入口");

        assertThatThrownBy(() -> dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(firstUserEntry.id(), "非法覆盖", "https://illegal.example.com", "Link", true)
                ))
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("快捷入口不存在或无权访问");
    }

    /**
     * 首页总览应同时返回启用中的系统入口与当前用户自己的入口。
     */
    @Test
    void shouldReturnShortcutOverviewWithEnabledSystemEntriesAndCurrentUserEntries() {
        UserEntity user = createUser("dashboard-shortcut-c", "快捷入口用户C");
        loginAs(user);

        dashboardShortcutEntryService.createSystemEntry(new DashboardShortcutAdminRequest(
                "GitLab",
                "https://gitlab.example.com",
                "Connection",
                true,
                2
        ));
        dashboardShortcutEntryService.createSystemEntry(new DashboardShortcutAdminRequest(
                "停用入口",
                "https://disabled.example.com",
                "Link",
                false,
                1
        ));
        dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(null, "我的 Jenkins", "https://jenkins.example.com", "Promotion", true)
                ))
        );

        DashboardShortcutOverview overview = dashboardShortcutEntryService.getCurrentUserShortcutOverview();

        assertThat(overview.systemEntries())
                .extracting(DashboardShortcutEntrySummary::name)
                .containsExactly("GitLab");
        assertThat(overview.userEntries())
                .extracting(DashboardShortcutEntrySummary::name)
                .containsExactly("我的 Jenkins");
    }

    /**
     * 链接地址必须带协议头，并限制为 http/https。
     */
    @Test
    void shouldRejectInvalidShortcutUrl() {
        UserEntity user = createUser("dashboard-shortcut-d", "快捷入口用户D");
        loginAs(user);

        assertThatThrownBy(() -> dashboardShortcutEntryService.saveCurrentUserEntries(
                new SaveDashboardShortcutEntriesRequest(List.of(
                        new SaveDashboardShortcutEntryItemRequest(null, "非法地址", "javascript:alert(1)", "WarningFilled", true)
                ))
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("快捷入口链接地址仅支持 http 或 https");
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
     * 切换当前线程的登录态，模拟当前用户操作自己的快捷入口。
     */
    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                Set.of(),
                Set.of("dashboard:view", "system:shortcut:view", "system:shortcut:manage")
        ));
    }
}
