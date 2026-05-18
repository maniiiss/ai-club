package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabUserOauthBindingEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.GitlabUserOauthBindingSummary;
import com.aiclub.platform.dto.request.GitlabUserOauthAuthorizeRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthCallbackRequest;
import com.aiclub.platform.repository.GitlabUserOauthBindingRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 覆盖 GitLab 用户 OAuth 绑定的关键链路：授权回调、state 校验和过期刷新。
 */
@ExtendWith(MockitoExtension.class)
class GitlabUserOauthServiceTests {

    @Mock
    private GitlabUserOauthBindingRepository bindingRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TokenCipherService tokenCipherService;

    @Mock
    private GitlabApiService gitlabApiService;

    @Mock
    private GitlabOauthStateService gitlabOauthStateService;

    @Mock
    private AuthService authService;

    @Mock
    private PlatformEnvVarResolver platformEnvVarResolver;

    private GitlabUserOauthService gitlabUserOauthService;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(platformEnvVarResolver.resolveOrDefault(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyString()
        )).thenAnswer(invocation -> invocation.getArgument(2));
        gitlabUserOauthService = new GitlabUserOauthService(
                bindingRepository,
                userRepository,
                tokenCipherService,
                gitlabApiService,
                gitlabOauthStateService,
                authService,
                platformEnvVarResolver,
                "http://gitlab.example.com/api/v4",
                "client-id",
                "client-secret",
                "http://localhost:5173/profile/gitlab-callback"
        );
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    /**
     * 授权回调成功后应保存绑定、回写兼容用户名，并刷新当前会话快照。
     */
    @Test
    void shouldPersistBindingAndRefreshSessionAfterOauthCallback() {
        UserEntity currentUser = buildCurrentUser(1L);
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(gitlabOauthStateService.parseState("oauth-state"))
                .thenReturn(new GitlabOauthStateService.GitlabOauthStatePayload(1L, "http://gitlab.example.com/api/v4", Instant.now()));
        when(gitlabApiService.exchangeAuthorizationCode(
                "http://gitlab.example.com/api/v4",
                "client-id",
                "client-secret",
                "oauth-code",
                "http://localhost:5173/profile/gitlab-callback"
        )).thenReturn(new GitlabApiService.GitlabOAuthToken("access-token", "refresh-token", 3600, "bearer"));
        when(gitlabApiService.fetchCurrentUser(
                "http://gitlab.example.com/api/v4",
                GitlabApiService.GitlabAuthorization.bearerToken("access-token")
        )).thenReturn(new GitlabApiService.GitlabUser(99L, "alice", "Alice"));
        when(bindingRepository.findByUser_Id(1L)).thenReturn(Optional.empty());
        when(tokenCipherService.encrypt("access-token")).thenReturn("enc-access-token");
        when(tokenCipherService.encrypt("refresh-token")).thenReturn("enc-refresh-token");
        when(bindingRepository.save(any(GitlabUserOauthBindingEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(userRepository.save(currentUser)).thenReturn(currentUser);
        when(authService.refreshCurrentUserSessionSnapshot()).thenReturn(new CurrentUserInfo(
                1L,
                "platform-user",
                "平台用户",
                "",
                "",
                "alice",
                "",
                true,
                java.util.List.of(),
                java.util.List.of(),
                java.util.List.of()
        ));

        GitlabUserOauthBindingSummary summary = gitlabUserOauthService.handleOauthCallback(
                new GitlabUserOauthCallbackRequest("oauth-code", "oauth-state")
        );

        assertThat(summary.connected()).isTrue();
        assertThat(summary.gitlabUserId()).isEqualTo(99L);
        assertThat(summary.gitlabUsername()).isEqualTo("alice");
        assertThat(summary.gitlabName()).isEqualTo("Alice");
        assertThat(currentUser.getGitlabUserId()).isEqualTo(99L);
        assertThat(currentUser.getGitlabUsername()).isEqualTo("alice");
        assertThat(currentUser.getGitlabName()).isEqualTo("Alice");
        verify(bindingRepository).save(any(GitlabUserOauthBindingEntity.class));
        verify(authService).refreshCurrentUserSessionSnapshot();
    }

    /**
     * 回调 state 中的用户与当前登录用户不一致时必须拒绝绑定，防止串号。
     */
    @Test
    void shouldRejectOauthCallbackWhenStateUserDoesNotMatchCurrentUser() {
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(buildCurrentUser(1L)));
        when(gitlabOauthStateService.parseState("oauth-state"))
                .thenReturn(new GitlabOauthStateService.GitlabOauthStatePayload(2L, "http://gitlab.example.com/api/v4", Instant.now()));

        assertThatThrownBy(() -> gitlabUserOauthService.handleOauthCallback(new GitlabUserOauthCallbackRequest("oauth-code", "oauth-state")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前登录用户与 GitLab 授权请求不匹配，请重新发起绑定");
    }

    /**
     * access token 过期时应优先使用 refresh token 换新，并返回新的 Bearer 凭证。
     */
    @Test
    void shouldRefreshExpiredAccessTokenBeforeReturningCurrentUserAccess() {
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(buildCurrentUser(1L)));

        GitlabUserOauthBindingEntity binding = new GitlabUserOauthBindingEntity();
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setGitlabName("Alice");
        binding.setGitlabUsername("alice");
        binding.setAccessTokenCiphertext("enc-old-access-token");
        binding.setRefreshTokenCiphertext("enc-refresh-token");
        binding.setExpiresAt(LocalDateTime.now().minusMinutes(5));
        when(bindingRepository.findByUser_Id(1L)).thenReturn(Optional.of(binding));
        when(tokenCipherService.decrypt("enc-refresh-token")).thenReturn("refresh-token");
        when(gitlabApiService.refreshOAuthToken(
                "http://gitlab.example.com/api/v4",
                "client-id",
                "client-secret",
                "refresh-token",
                "http://localhost:5173/profile/gitlab-callback"
        )).thenReturn(new GitlabApiService.GitlabOAuthToken("new-access-token", "new-refresh-token", 7200, "bearer"));
        when(tokenCipherService.encrypt("new-access-token")).thenReturn("enc-new-access-token");
        when(tokenCipherService.encrypt("new-refresh-token")).thenReturn("enc-new-refresh-token");
        when(bindingRepository.save(binding)).thenReturn(binding);
        when(tokenCipherService.decrypt("enc-new-access-token")).thenReturn("new-access-token");

        GitlabUserOauthService.CurrentGitlabOauthAccess access = gitlabUserOauthService.requireCurrentUserAccess("http://gitlab.example.com/api/v4");

        assertThat(access.gitlabName()).isEqualTo("Alice");
        assertThat(access.gitlabUsername()).isEqualTo("alice");
        assertThat(access.authorization().headerName()).isEqualTo("Authorization");
        assertThat(access.authorization().headerValue()).isEqualTo("Bearer new-access-token");
        verify(bindingRepository).save(binding);
    }

    /**
     * access token 过期且没有 refresh token 时，应明确提示重新绑定而不是继续发请求。
     */
    @Test
    void shouldRejectExpiredAccessWithoutRefreshToken() {
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(buildCurrentUser(1L)));

        GitlabUserOauthBindingEntity binding = new GitlabUserOauthBindingEntity();
        binding.setApiBaseUrl("http://gitlab.example.com/api/v4");
        binding.setAccessTokenCiphertext("enc-old-access-token");
        binding.setExpiresAt(LocalDateTime.now().minusMinutes(5));
        when(bindingRepository.findByUser_Id(1L)).thenReturn(Optional.of(binding));

        assertThatThrownBy(() -> gitlabUserOauthService.requireCurrentUserAccess("http://gitlab.example.com/api/v4"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("GitLab 授权已过期，请前往个人中心重新绑定");
    }

    /**
     * v1 仅支持默认 GitLab 实例，非默认实例的仓库需要直接阻断。
     */
    @Test
    void shouldRejectCurrentUserAccessForNonDefaultGitlabInstance() {
        assertThatThrownBy(() -> gitlabUserOauthService.requireCurrentUserAccess("http://another-gitlab.example.com/api/v4"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("当前仓库实例暂不支持使用个人 GitLab 授权发起 MR");
    }

    /**
     * 未绑定场景也要返回默认 GitLab 实例地址，方便前端统一展示和比较。
     */
    @Test
    void shouldReturnDisconnectedSummaryWhenCurrentUserHasNoBinding() {
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(buildCurrentUser(1L)));
        when(bindingRepository.findByUser_Id(1L)).thenReturn(Optional.empty());

        GitlabUserOauthBindingSummary summary = gitlabUserOauthService.getCurrentUserBindingSummary();

        assertThat(summary.connected()).isFalse();
        assertThat(summary.apiBaseUrl()).isEqualTo("http://gitlab.example.com/api/v4");
    }

    /**
     * 用户管理中已绑定 GitLab 用户但尚未 OAuth 授权时，个人中心仍应展示远端用户快照。
     */
    @Test
    void shouldReturnDisconnectedSummaryWithUserManagementGitlabSnapshot() {
        UserEntity currentUser = buildCurrentUser(1L);
        currentUser.setGitlabUserId(99L);
        currentUser.setGitlabUsername("alice");
        currentUser.setGitlabName("Alice");
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(bindingRepository.findByUser_Id(1L)).thenReturn(Optional.empty());

        GitlabUserOauthBindingSummary summary = gitlabUserOauthService.getCurrentUserBindingSummary();

        assertThat(summary.connected()).isFalse();
        assertThat(summary.apiBaseUrl()).isEqualTo("http://gitlab.example.com/api/v4");
        assertThat(summary.gitlabUserId()).isEqualTo(99L);
        assertThat(summary.gitlabUsername()).isEqualTo("alice");
        assertThat(summary.gitlabName()).isEqualTo("Alice");
        assertThat(summary.expiresAt()).isNull();
    }

    /**
     * 生成授权地址时应把默认 GitLab API 地址透传给 state，用于回调时再次校验。
     */
    @Test
    void shouldCreateAuthorizeUrlForCurrentUser() {
        AuthContextHolder.set(new AuthContext(1L, "platform-user", "平台用户", Set.of(), Set.of()));
        when(userRepository.findById(1L)).thenReturn(Optional.of(buildCurrentUser(1L)));
        when(gitlabOauthStateService.generateState(1L, "http://gitlab.example.com/api/v4")).thenReturn("oauth-state");

        String authorizeUrl = gitlabUserOauthService.createAuthorizeUrl(new GitlabUserOauthAuthorizeRequest(null)).authorizeUrl();

        assertThat(authorizeUrl).contains("oauth/authorize");
        assertThat(authorizeUrl).contains("state=oauth-state");
        assertThat(authorizeUrl).contains("scope=api");
    }

    private UserEntity buildCurrentUser(Long userId) {
        UserEntity user = new UserEntity();
        user.setId(userId);
        user.setUsername("platform-user");
        user.setNickname("平台用户");
        user.setEnabled(true);
        return user;
    }
}
