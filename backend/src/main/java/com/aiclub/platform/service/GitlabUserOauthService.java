package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.GitlabUserOauthBindingEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.GitlabUserOauthAuthorizeResult;
import com.aiclub.platform.dto.GitlabUserOauthBindingSummary;
import com.aiclub.platform.dto.request.GitlabUserOauthAuthorizeRequest;
import com.aiclub.platform.dto.request.GitlabUserOauthCallbackRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.GitlabUserOauthBindingRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.NoSuchElementException;

/**
 * 管理当前登录用户在默认 GitLab 实例上的 OAuth 绑定和 access token 刷新。
 */
@Service
@Transactional(readOnly = true)
public class GitlabUserOauthService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long ACCESS_TOKEN_REFRESH_BUFFER_SECONDS = 60L;

    private final GitlabUserOauthBindingRepository bindingRepository;
    private final UserRepository userRepository;
    private final TokenCipherService tokenCipherService;
    private final GitlabApiService gitlabApiService;
    private final GitlabOauthStateService gitlabOauthStateService;
    private final AuthService authService;
    private final PlatformEnvVarResolver platformEnvVarResolver;
    private final String defaultApiUrl;
    private final String oauthClientId;
    private final String oauthClientSecret;
    private final String oauthRedirectUri;

    public GitlabUserOauthService(GitlabUserOauthBindingRepository bindingRepository,
                                  UserRepository userRepository,
                                  TokenCipherService tokenCipherService,
                                  GitlabApiService gitlabApiService,
                                  GitlabOauthStateService gitlabOauthStateService,
                                  AuthService authService,
                                  PlatformEnvVarResolver platformEnvVarResolver,
                                  @Value("${platform.gitlab.default-api-url}") String defaultApiUrl,
                                  @Value("${platform.gitlab.oauth.client-id:}") String oauthClientId,
                                  @Value("${platform.gitlab.oauth.client-secret:}") String oauthClientSecret,
                                  @Value("${platform.gitlab.oauth.redirect-uri}") String oauthRedirectUri) {
        this.bindingRepository = bindingRepository;
        this.userRepository = userRepository;
        this.tokenCipherService = tokenCipherService;
        this.gitlabApiService = gitlabApiService;
        this.gitlabOauthStateService = gitlabOauthStateService;
        this.authService = authService;
        this.platformEnvVarResolver = platformEnvVarResolver;
        this.defaultApiUrl = normalizeApiBaseUrl(defaultApiUrl);
        this.oauthClientId = oauthClientId == null ? "" : oauthClientId.trim();
        this.oauthClientSecret = oauthClientSecret == null ? "" : oauthClientSecret.trim();
        this.oauthRedirectUri = oauthRedirectUri == null ? "" : oauthRedirectUri.trim();
    }

    /**
     * 返回当前用户在默认 GitLab 实例上的 OAuth 绑定摘要。
     */
    public GitlabUserOauthBindingSummary getCurrentUserBindingSummary() {
        UserEntity currentUser = requireCurrentUser();
        return bindingRepository.findByUser_Id(currentUser.getId())
                .map(this::toSummary)
                .orElseGet(() -> toDisconnectedSummary(currentUser));
    }

    /**
     * 为个人中心生成 GitLab OAuth 授权链接。
     */
    public GitlabUserOauthAuthorizeResult createAuthorizeUrl(GitlabUserOauthAuthorizeRequest request) {
        ensureOauthClientConfigured();
        UserEntity currentUser = requireCurrentUser();
        String apiBaseUrl = requireDefaultGitlabApiUrl(request == null ? null : request.apiBaseUrl());
        String state = gitlabOauthStateService.generateState(currentUser.getId(), apiBaseUrl);
        String authorizeUrl = resolveGitlabSiteBaseUrl(apiBaseUrl)
                + "/oauth/authorize?client_id=" + urlEncode(resolveOauthClientId())
                + "&redirect_uri=" + urlEncode(resolveOauthRedirectUri())
                + "&response_type=code"
                + "&scope=" + urlEncode("api")
                + "&state=" + urlEncode(state);
        return new GitlabUserOauthAuthorizeResult(authorizeUrl);
    }

    /**
     * 处理 GitLab OAuth 回调，并把 access/refresh token 绑定到当前平台用户。
     */
    @Transactional
    public GitlabUserOauthBindingSummary handleOauthCallback(GitlabUserOauthCallbackRequest request) {
        ensureOauthClientConfigured();
        UserEntity currentUser = requireCurrentUser();
        GitlabOauthStateService.GitlabOauthStatePayload statePayload = gitlabOauthStateService.parseState(request.state());
        if (!currentUser.getId().equals(statePayload.userId())) {
            throw new IllegalArgumentException("当前登录用户与 GitLab 授权请求不匹配，请重新发起绑定");
        }

        String apiBaseUrl = requireDefaultGitlabApiUrl(statePayload.apiBaseUrl());
        GitlabApiService.GitlabOAuthToken oauthToken = gitlabApiService.exchangeAuthorizationCode(
                apiBaseUrl,
                resolveOauthClientId(),
                resolveOauthClientSecret(),
                request.code().trim(),
                resolveOauthRedirectUri()
        );
        GitlabApiService.GitlabUser gitlabUser = gitlabApiService.fetchCurrentUser(
                apiBaseUrl,
                GitlabApiService.GitlabAuthorization.bearerToken(oauthToken.accessToken())
        );

        GitlabUserOauthBindingEntity entity = bindingRepository.findByUser_Id(currentUser.getId())
                .orElseGet(GitlabUserOauthBindingEntity::new);
        entity.setUser(currentUser);
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setGitlabUserId(gitlabUser.id());
        entity.setGitlabUsername(defaultString(gitlabUser.username()));
        entity.setGitlabName(defaultString(gitlabUser.name()));
        applyOauthToken(entity, oauthToken);
        bindingRepository.save(entity);

        // OAuth 绑定成功后同步回写用户管理快照，保留个人资料、告警归属和跨系统人员映射能力。
        currentUser.setGitlabUserId(gitlabUser.id());
        currentUser.setGitlabUsername(defaultString(gitlabUser.username()));
        currentUser.setGitlabName(defaultString(gitlabUser.name()));
        userRepository.save(currentUser);
        authService.refreshCurrentUserSessionSnapshot();
        return toSummary(entity);
    }

    /**
     * 解绑当前用户的 GitLab OAuth 绑定，不清空资料页中的兼容 GitLab 用户名字段。
     */
    @Transactional
    public void unbindCurrentUser() {
        UserEntity currentUser = requireCurrentUser();
        bindingRepository.findByUser_Id(currentUser.getId()).ifPresent(bindingRepository::delete);
    }

    /**
     * 快速发起 MR 时读取当前用户有效的 OAuth 凭证，必要时先尝试刷新 access token。
     */
    @Transactional
    public CurrentGitlabOauthAccess requireCurrentUserAccess(String apiBaseUrl) {
        String normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
        if (!resolveDefaultApiUrl().equals(normalizedApiBaseUrl)) {
            throw new IllegalArgumentException("当前仓库实例暂不支持使用个人 GitLab 授权发起 MR");
        }
        UserEntity currentUser = requireCurrentUser();
        GitlabUserOauthBindingEntity entity = bindingRepository.findByUser_Id(currentUser.getId())
                .orElseThrow(() -> new IllegalArgumentException("当前用户尚未绑定 GitLab 账户，请先前往个人中心完成授权"));
        if (!normalizedApiBaseUrl.equals(normalizeApiBaseUrl(entity.getApiBaseUrl()))) {
            throw new IllegalArgumentException("当前仓库实例暂不支持使用个人 GitLab 授权发起 MR");
        }
        if (shouldRefreshAccessToken(entity)) {
            refreshAccessToken(entity);
        }
        String accessToken = tokenCipherService.decrypt(entity.getAccessTokenCiphertext());
        return new CurrentGitlabOauthAccess(
                GitlabApiService.GitlabAuthorization.bearerToken(accessToken),
                entity.getGitlabName(),
                entity.getGitlabUsername()
        );
    }

    private void refreshAccessToken(GitlabUserOauthBindingEntity entity) {
        String refreshTokenCiphertext = entity.getRefreshTokenCiphertext();
        if (!hasText(refreshTokenCiphertext)) {
            throw new IllegalArgumentException("GitLab 授权已过期，请前往个人中心重新绑定");
        }
        try {
            GitlabApiService.GitlabOAuthToken oauthToken = gitlabApiService.refreshOAuthToken(
                    normalizeApiBaseUrl(entity.getApiBaseUrl()),
                    resolveOauthClientId(),
                    resolveOauthClientSecret(),
                    tokenCipherService.decrypt(refreshTokenCiphertext),
                    resolveOauthRedirectUri()
            );
            applyOauthToken(entity, oauthToken);
            bindingRepository.save(entity);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("GitLab 授权已过期，请前往个人中心重新绑定", exception);
        }
    }

    /**
     * 统一写入 access/refresh token 与过期时间，避免刷新和首次绑定逻辑分叉。
     */
    private void applyOauthToken(GitlabUserOauthBindingEntity entity, GitlabApiService.GitlabOAuthToken oauthToken) {
        entity.setAccessTokenCiphertext(tokenCipherService.encrypt(oauthToken.accessToken()));
        if (hasText(oauthToken.refreshToken())) {
            entity.setRefreshTokenCiphertext(tokenCipherService.encrypt(oauthToken.refreshToken()));
        }
        entity.setExpiresAt(resolveExpiresAt(oauthToken.expiresInSeconds()));
    }

    private GitlabUserOauthBindingSummary toSummary(GitlabUserOauthBindingEntity entity) {
        return new GitlabUserOauthBindingSummary(
                true,
                normalizeApiBaseUrl(entity.getApiBaseUrl()),
                entity.getGitlabUserId(),
                entity.getGitlabUsername(),
                entity.getGitlabName(),
                formatTime(entity.getExpiresAt())
        );
    }

    /**
     * 尚未完成 OAuth 授权时，仍返回用户管理中保存的 GitLab 用户快照，避免前端把“已绑定用户但未授权”误判为“未绑定用户”。
     */
    private GitlabUserOauthBindingSummary toDisconnectedSummary(UserEntity currentUser) {
        return new GitlabUserOauthBindingSummary(
                false,
                resolveDefaultApiUrl(),
                currentUser.getGitlabUserId(),
                nullableString(currentUser.getGitlabUsername()),
                nullableString(currentUser.getGitlabName()),
                null
        );
    }

    private boolean shouldRefreshAccessToken(GitlabUserOauthBindingEntity entity) {
        if (entity.getExpiresAt() == null) {
            return false;
        }
        return !entity.getExpiresAt().isAfter(LocalDateTime.now().plusSeconds(ACCESS_TOKEN_REFRESH_BUFFER_SECONDS));
    }

    private LocalDateTime resolveExpiresAt(Integer expiresInSeconds) {
        if (expiresInSeconds == null || expiresInSeconds <= 0) {
            return null;
        }
        return LocalDateTime.now().plusSeconds(expiresInSeconds);
    }

    private UserEntity requireCurrentUser() {
        Long userId = AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在: " + userId));
    }

    private void ensureOauthClientConfigured() {
        if (!hasText(resolveOauthClientId()) || !hasText(resolveOauthClientSecret()) || !hasText(resolveOauthRedirectUri())) {
            throw new IllegalStateException("当前环境未配置 GitLab OAuth 参数，请联系管理员");
        }
    }

    private String requireDefaultGitlabApiUrl(String apiBaseUrl) {
        String resolvedDefaultApiUrl = resolveDefaultApiUrl();
        String normalized = hasText(apiBaseUrl) ? normalizeApiBaseUrl(apiBaseUrl) : resolvedDefaultApiUrl;
        if (!resolvedDefaultApiUrl.equals(normalized)) {
            throw new IllegalArgumentException("当前仅支持绑定默认 GitLab 实例");
        }
        return normalized;
    }

    /**
     * GitLab OAuth 授权页位于站点根路径，不在 /api/v4 下面。
     */
    private String resolveGitlabSiteBaseUrl(String apiBaseUrl) {
        return normalizeApiBaseUrl(apiBaseUrl)
                .replaceAll("/api/v4/?$", "")
                .replaceAll("/+$", "");
    }

    private String normalizeApiBaseUrl(String apiBaseUrl) {
        String value = apiBaseUrl == null ? "" : apiBaseUrl.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String nullableString(String value) {
        String normalized = defaultString(value);
        return normalized.isEmpty() ? null : normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String resolveDefaultApiUrl() {
        return normalizeApiBaseUrl(platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITLAB_DEFAULT_API_URL,
                () -> null,
                defaultApiUrl
        ));
    }

    private String resolveOauthClientId() {
        return platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITLAB_OAUTH_CLIENT_ID,
                () -> null,
                oauthClientId
        );
    }

    private String resolveOauthClientSecret() {
        return platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITLAB_OAUTH_CLIENT_SECRET,
                () -> null,
                oauthClientSecret
        );
    }

    private String resolveOauthRedirectUri() {
        return platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_GITLAB_OAUTH_REDIRECT_URI,
                () -> null,
                oauthRedirectUri
        );
    }

    /**
     * 快速发起 MR 时返回给业务层的当前 GitLab 发起账号信息。
     */
    public record CurrentGitlabOauthAccess(
            GitlabApiService.GitlabAuthorization authorization,
            String gitlabName,
            String gitlabUsername
    ) {
    }
}
