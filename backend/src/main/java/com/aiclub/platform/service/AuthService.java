package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.LoginResult;
import com.aiclub.platform.dto.request.ChangePasswordRequest;
import com.aiclub.platform.dto.request.LoginRequest;
import com.aiclub.platform.dto.request.RegisterRequest;
import com.aiclub.platform.dto.request.UpdateProfileRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.security.LoginSession;
import com.aiclub.platform.security.LoginSessionStore;
import com.aiclub.platform.security.TokenService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final LoginSessionStore loginSessionStore;
    private final AccessManagementService accessManagementService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       TokenService tokenService,
                       LoginSessionStore loginSessionStore,
                       AccessManagementService accessManagementService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.loginSessionStore = loginSessionStore;
        this.accessManagementService = accessManagementService;
    }

    @Transactional
    public LoginResult login(LoginRequest request) {
        UserEntity user = userRepository.findByUsernameWithDetails(request.username().trim())
                .orElseThrow(() -> new UnauthorizedException("Invalid username or password"));

        if (!user.isEnabled()) {
            throw new UnauthorizedException("Current account is disabled");
        }
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid username or password");
        }

        accessManagementService.updateUserLastLogin(user.getId());
        UserEntity latestUser = userRepository.findWithDetailsById(user.getId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        TokenService.TokenPayload tokenPayload = tokenService.createToken(latestUser.getId());
        CurrentUserInfo currentUserInfo = toCurrentUserInfo(latestUser);
        loginSessionStore.save(tokenPayload.token(), currentUserInfo, tokenPayload.expiresAt());

        return new LoginResult(
                tokenPayload.token(),
                TIME_FORMATTER.format(tokenPayload.expiresAt().atZone(ZoneId.systemDefault()).toLocalDateTime()),
                currentUserInfo
        );
    }

    public CurrentUserInfo currentUser() {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));

        if (authContext.token() != null && !authContext.token().isBlank()) {
            return loginSessionStore.get(authContext.token())
                    .map(LoginSession::toCurrentUserInfo)
                    .orElseGet(() -> rebuildSession(authContext.token(), tokenService.parseToken(authContext.token())).toCurrentUserInfo());
        }

        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        if (!user.isEnabled()) {
            throw new UnauthorizedException("Current account is disabled");
        }
        return toCurrentUserInfo(user);
    }

    @Transactional
    public void register(RegisterRequest request) {
        String username = request.username().trim();
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new IllegalArgumentException("Username already exists");
        }

        UserEntity entity = new UserEntity();
        entity.setUsername(username);
        entity.setNickname(request.nickname().trim());
        entity.setEmail(defaultString(request.email()));
        entity.setPhone(defaultString(request.phone()));
        entity.setGitlabUsername(defaultString(request.gitlabUsername()));
        entity.setEnabled(false);
        entity.setBuiltIn(false);
        entity.setPasswordHash(passwordEncoder.encode(request.password().trim()));
        userRepository.save(entity);
    }

    @Transactional
    public CurrentUserInfo updateProfile(UpdateProfileRequest request) {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        user.setNickname(request.nickname().trim());
        user.setEmail(defaultString(request.email()));
        user.setPhone(defaultString(request.phone()));
        user.setGitlabUsername(defaultString(request.gitlabUsername()));
        if (request.avatarUrl() != null) {
            user.setAvatarUrl(defaultString(request.avatarUrl()));
        }

        CurrentUserInfo currentUserInfo = toCurrentUserInfo(userRepository.save(user));
        refreshCurrentSession(authContext, currentUserInfo);
        return currentUserInfo;
    }

    /**
     * 当其它业务流程直接修改了当前用户资料时，通过这里统一刷新会话快照。
     */
    @Transactional
    public CurrentUserInfo refreshCurrentUserSessionSnapshot() {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        if (!user.isEnabled()) {
            throw new UnauthorizedException("Current account is disabled");
        }
        CurrentUserInfo currentUserInfo = toCurrentUserInfo(user);
        refreshCurrentSession(authContext, currentUserInfo);
        return currentUserInfo;
    }

    /**
     * 更新当前用户头像，并立即同步刷新登录会话中的头像信息。
     */
    @Transactional
    public CurrentUserInfo updateAvatar(String avatarUrl) {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        user.setAvatarUrl(defaultString(avatarUrl));

        CurrentUserInfo currentUserInfo = toCurrentUserInfo(userRepository.save(user));
        refreshCurrentSession(authContext, currentUserInfo);
        return currentUserInfo;
    }

    @Transactional
    public void changePassword(ChangePasswordRequest request) {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword().trim()));
        userRepository.save(user);
    }

    public void logout(String bearerToken) {
        if (bearerToken == null || bearerToken.isBlank()) {
            return;
        }
        String rawToken = tokenService.resolveRawToken(bearerToken);
        Instant expiresAt = tokenService.parseToken(rawToken).expiresAt();
        loginSessionStore.markLoggedOut(rawToken, expiresAt);
    }

    public AuthContext authenticate(String bearerToken) {
        TokenService.TokenClaims claims = tokenService.parseToken(bearerToken);
        String rawToken = tokenService.resolveRawToken(bearerToken);
        if (loginSessionStore.isLoggedOut(rawToken)) {
            throw new UnauthorizedException("Not logged in or session expired");
        }
        LoginSession loginSession = loginSessionStore.get(rawToken)
                .orElseGet(() -> rebuildSession(rawToken, claims));

        if (!loginSession.enabled()) {
            throw new UnauthorizedException("Current account is disabled");
        }
        return loginSession.toAuthContext(rawToken);
    }

    private LoginSession rebuildSession(String rawToken, TokenService.TokenClaims claims) {
        UserEntity user = userRepository.findWithDetailsById(claims.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        if (!user.isEnabled()) {
            throw new UnauthorizedException("Current account is disabled");
        }

        CurrentUserInfo currentUserInfo = toCurrentUserInfo(user);
        loginSessionStore.save(rawToken, currentUserInfo, claims.expiresAt());
        return LoginSession.fromCurrentUserInfo(currentUserInfo);
    }

    private void refreshCurrentSession(AuthContext authContext, CurrentUserInfo currentUserInfo) {
        if (authContext.token() == null || authContext.token().isBlank()) {
            return;
        }
        Instant expiresAt = tokenService.parseToken(authContext.token()).expiresAt();
        loginSessionStore.save(authContext.token(), currentUserInfo, expiresAt);
    }

    private CurrentUserInfo toCurrentUserInfo(UserEntity user) {
        List<RoleEntity> roles = user.getRoles().stream()
                .filter(RoleEntity::isEnabled)
                .sorted(Comparator.comparing(RoleEntity::getId))
                .toList();
        List<String> permissionCodes = collectPermissionCodes(user).stream().toList();
        return new CurrentUserInfo(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getEmail(),
                user.getPhone(),
                user.getGitlabUsername(),
                user.getAvatarUrl(),
                user.isEnabled(),
                roles.stream().map(RoleEntity::getCode).toList(),
                roles.stream().map(RoleEntity::getName).toList(),
                permissionCodes
        );
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private Set<String> collectRoleCodes(UserEntity user) {
        return user.getRoles().stream()
                .filter(RoleEntity::isEnabled)
                .sorted(Comparator.comparing(RoleEntity::getId))
                .map(RoleEntity::getCode)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
    }

    private Set<String> collectPermissionCodes(UserEntity user) {
        return user.getRoles().stream()
                .filter(RoleEntity::isEnabled)
                .flatMap(role -> role.getPermissions().stream())
                .filter(PermissionEntity::isEnabled)
                .sorted(Comparator.comparing(PermissionEntity::getSortOrder).thenComparing(PermissionEntity::getId))
                .map(PermissionEntity::getCode)
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
    }
}
