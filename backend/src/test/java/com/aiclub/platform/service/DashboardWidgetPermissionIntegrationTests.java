package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.repository.PermissionRepository;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖首页看板组件权限的聚合行为，确保组件级权限能跟随角色正确下发到当前登录用户。
 */
@SpringBootTest
@Transactional
class DashboardWidgetPermissionIntegrationTests {

    private static final List<String> DASHBOARD_WIDGET_PERMISSION_CODES = List.of(
            "dashboard:widget:project-stats",
            "dashboard:widget:agent-stats",
            "dashboard:widget:task-stats",
            "dashboard:widget:quick-build",
            "dashboard:widget:quick-merge",
            "dashboard:widget:active-projects",
            "dashboard:widget:online-agents",
            "dashboard:widget:recent-tasks",
            "dashboard:widget:quick-tasks"
    );

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private PermissionRepository permissionRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    /**
     * 超级管理员角色拥有页面权限和组件权限时，当前用户信息应完整返回所有首页组件权限码。
     */
    @Test
    void shouldReturnDashboardWidgetPermissionsForSuperAdmin() {
        PermissionEntity dashboardPermission = createPermission("首页看板", "dashboard:view", 10);
        Set<PermissionEntity> permissions = new LinkedHashSet<>();
        permissions.add(dashboardPermission);
        DASHBOARD_WIDGET_PERMISSION_CODES.forEach((code) -> permissions.add(createPermission("组件权限-" + code, code, 100 + permissions.size())));

        RoleEntity superAdminRole = createRole("超级管理员", "SUPER_ADMIN", permissions);
        UserEntity adminUser = createUser("dashboard-admin", "首页管理员", Set.of(superAdminRole));

        loginAs(adminUser, Set.of("SUPER_ADMIN"), Set.of("dashboard:view"));
        CurrentUserInfo currentUserInfo = authService.currentUser();

        assertThat(currentUserInfo.permissionCodes()).contains("dashboard:view");
        assertThat(currentUserInfo.permissionCodes()).containsAll(DASHBOARD_WIDGET_PERMISSION_CODES);
    }

    /**
     * 普通角色即使具备首页页面权限，只要没有组件权限，也不应拿到任何首页组件权限码。
     */
    @Test
    void shouldNotReturnDashboardWidgetPermissionsForRegularRoleWithoutAssignments() {
        PermissionEntity dashboardPermission = createPermission("首页看板", "dashboard:view", 10);
        RoleEntity projectMemberRole = createRole("项目成员", "PROJECT_MEMBER", Set.of(dashboardPermission));
        UserEntity regularUser = createUser("dashboard-member", "首页成员", Set.of(projectMemberRole));

        loginAs(regularUser, Set.of("PROJECT_MEMBER"), Set.of("dashboard:view"));
        CurrentUserInfo currentUserInfo = authService.currentUser();

        assertThat(currentUserInfo.permissionCodes()).contains("dashboard:view");
        assertThat(currentUserInfo.permissionCodes()).doesNotContainAnyElementsOf(DASHBOARD_WIDGET_PERMISSION_CODES);
    }

    /**
     * 创建测试权限实体，模拟迁移落库后的权限数据。
     */
    private PermissionEntity createPermission(String name, String code, int sortOrder) {
        PermissionEntity permission = new PermissionEntity();
        permission.setName(name);
        permission.setCode(code);
        permission.setType("ACTION");
        permission.setEnabled(true);
        permission.setBuiltIn(true);
        permission.setSortOrder(sortOrder);
        permission.setDescription("首页看板组件权限测试数据");
        return permissionRepository.save(permission);
    }

    /**
     * 创建测试角色，并挂上指定权限集合。
     */
    private RoleEntity createRole(String name, String code, Set<PermissionEntity> permissions) {
        RoleEntity role = new RoleEntity();
        role.setName(name);
        role.setCode(code);
        role.setEnabled(true);
        role.setBuiltIn(false);
        role.setDescription("首页看板组件权限测试角色");
        role.setPermissions(new LinkedHashSet<>(permissions));
        return roleRepository.save(role);
    }

    /**
     * 创建测试用户，并关联指定角色集合。
     */
    private UserEntity createUser(String username, String nickname, Set<RoleEntity> roles) {
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(roles));
        return userRepository.save(user);
    }

    /**
     * 模拟当前线程的登录态，让 AuthService 走真实的当前用户查询逻辑。
     */
    private void loginAs(UserEntity user, Set<String> roleCodes, Set<String> permissionCodes) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                roleCodes,
                permissionCodes
        ));
    }
}
