package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.security.LoginSession;
import com.aiclub.platform.security.LoginSessionStore;
import com.aiclub.platform.security.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖认证会话与实时角色权限的同步关系。
 */
class AuthServiceTests {

    /**
     * 角色权限被管理员调整后，旧登录会话不能继续携带 Redis 中缓存的动作权限。
     */
    @Test
    void authenticateShouldRefreshPermissionCodesFromLatestRoleState() {
        UserRepository userRepository = mock(UserRepository.class);
        RoleRepository roleRepository = mock(RoleRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        TokenService tokenService = mock(TokenService.class);
        LoginSessionStore loginSessionStore = mock(LoginSessionStore.class);
        AccessManagementService accessManagementService = mock(AccessManagementService.class);
        CreditService creditService = mock(CreditService.class);
        AuthService authService = new AuthService(
                userRepository,
                roleRepository,
                passwordEncoder,
                tokenService,
                loginSessionStore,
                accessManagementService,
                creditService
        );

        String bearerToken = "Bearer stale-token";
        String rawToken = "stale-token";
        Instant expiresAt = Instant.now().plusSeconds(3600);
        when(tokenService.parseToken(bearerToken)).thenReturn(new TokenService.TokenClaims(5L, expiresAt));
        when(tokenService.resolveRawToken(bearerToken)).thenReturn(rawToken);
        when(loginSessionStore.isLoggedOut(rawToken)).thenReturn(false);
        when(loginSessionStore.get(rawToken)).thenReturn(Optional.of(new LoginSession(
                5L,
                "test1",
                "测试用户1",
                "",
                "",
                "",
                "",
                true,
                List.of("PUBLIC_DEFAULT"),
                List.of("公众用户"),
                List.of("project:view", "project:manage"),
                List.of()
        )));
        when(userRepository.findWithDetailsById(5L)).thenReturn(Optional.of(userWithProjectViewOnly()));

        AuthContext context = authService.authenticate(bearerToken);

        assertThat(context.permissionCodes()).containsExactly("project:view");
    }

    /**
     * 公众端新手引导只接受实际路由使用的页面 key，避免旧版 ai-assistant/dev-tools 口径继续写入用户状态。
     */
    @Test
    void updateGuideStatusShouldOnlyAcceptCurrentPublicGuideKeys() {
        UserRepository userRepository = mock(UserRepository.class);
        RoleRepository roleRepository = mock(RoleRepository.class);
        PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
        TokenService tokenService = mock(TokenService.class);
        LoginSessionStore loginSessionStore = mock(LoginSessionStore.class);
        AccessManagementService accessManagementService = mock(AccessManagementService.class);
        CreditService creditService = mock(CreditService.class);
        AuthService authService = new AuthService(
                userRepository,
                roleRepository,
                passwordEncoder,
                tokenService,
                loginSessionStore,
                accessManagementService,
                creditService
        );

        try {
            AuthContextHolder.set(new AuthContext(5L, "guide-user", "引导用户", Set.of(), Set.of(), "guide-token"));
            Instant expiresAt = Instant.now().plusSeconds(3600);
            when(tokenService.parseToken("guide-token")).thenReturn(new TokenService.TokenClaims(5L, expiresAt));
            UserEntity user = userWithProjectViewOnly();
            when(userRepository.findWithDetailsById(5L)).thenReturn(Optional.of(user));

            authService.updateGuideStatus(List.of("dashboard", "projects", "chat", "development"));

            assertThat(user.getGuideCompleted()).isEqualTo("dashboard,projects,chat,development");
            verify(userRepository).save(user);
        } finally {
            AuthContextHolder.clear();
        }
    }

    /**
     * 旧版 ai-assistant/dev-tools 口径不得继续进入后端白名单。
     */
    @Test
    void updateGuideStatusShouldRejectLegacyGuideKeys() {
        AuthService authService = new AuthService(
                mock(UserRepository.class),
                mock(RoleRepository.class),
                mock(PasswordEncoder.class),
                mock(TokenService.class),
                mock(LoginSessionStore.class),
                mock(AccessManagementService.class),
                mock(CreditService.class)
        );

        assertThatThrownBy(() -> authService.updateGuideStatus(List.of("ai-assistant", "dev-tools")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("非法的引导页面 key");
    }

    /**
     * 历史账号可能已经持久化旧版页面 key，当前用户快照应过滤掉它们，避免前端下次保存时再次被白名单拒绝。
     */
    @Test
    void currentUserShouldFilterLegacyGuideKeysFromSnapshot() {
        UserRepository userRepository = mock(UserRepository.class);
        AuthService authService = new AuthService(
                userRepository,
                mock(RoleRepository.class),
                mock(PasswordEncoder.class),
                mock(TokenService.class),
                mock(LoginSessionStore.class),
                mock(AccessManagementService.class),
                mock(CreditService.class)
        );
        UserEntity user = userWithProjectViewOnly();
        user.setGuideCompleted("dashboard,ai-assistant,projects,dev-tools");
        when(userRepository.findWithDetailsById(5L)).thenReturn(Optional.of(user));

        try {
            AuthContextHolder.set(new AuthContext(5L, "guide-user", "引导用户", Set.of(), Set.of()));

            assertThat(authService.currentUser().guideCompleted()).containsExactly("dashboard", "projects");
        } finally {
            AuthContextHolder.clear();
        }
    }

    private UserEntity userWithProjectViewOnly() {
        PermissionEntity projectView = new PermissionEntity();
        projectView.setId(1L);
        projectView.setName("项目管理");
        projectView.setCode("project:view");
        projectView.setType("MENU");
        projectView.setSortOrder(20);
        projectView.setEnabled(true);

        RoleEntity publicRole = new RoleEntity();
        publicRole.setId(3L);
        publicRole.setName("公众用户");
        publicRole.setCode("PUBLIC_DEFAULT");
        publicRole.setEnabled(true);
        publicRole.setPermissions(Set.of(projectView));

        UserEntity user = new UserEntity();
        user.setId(5L);
        user.setUsername("test1");
        user.setNickname("测试用户1");
        user.setEmail("");
        user.setPhone("");
        user.setGitlabUsername("");
        user.setAvatarUrl("");
        user.setEnabled(true);
        user.setRoles(Set.of(publicRole));
        return user;
    }

}
