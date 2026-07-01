package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
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
import static org.mockito.Mockito.mock;
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
