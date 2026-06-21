package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformYaadeProjectBindingEntity;
import com.aiclub.platform.domain.model.PlatformYaadeUserBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.PlatformYaadeProjectBindingRepository;
import com.aiclub.platform.repository.PlatformYaadeUserBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 平台用户到 Yaade 本地账号的同步服务。
 */
@Service
@Transactional(readOnly = true)
public class YaadeUserSyncService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    /**
     * Yaade 管理端 resetpassword 会把用户密码重置为服务端自己的 YAADE_DEFAULT_PASSWORD。
     * 平台随后还会用 PLATFORM_YAADE_DEFAULT_USER_PASSWORD 去登录并旋转随机密码，
     * 因此两边配置必须保持一致，否则嵌入态会在代登阶段持续报 500。
     */
    private static final String DEFAULT_PASSWORD_MISMATCH_MESSAGE =
            "Yaade 受管用户密码修复失败：请保持 PLATFORM_YAADE_DEFAULT_USER_PASSWORD 与 Yaade 服务端 YAADE_DEFAULT_PASSWORD 一致";

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final PlatformYaadeProjectBindingRepository projectBindingRepository;
    private final PlatformYaadeUserBindingRepository userBindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final YaadeClientService yaadeClientService;
    private final YaadeProperties yaadeProperties;
    private final TokenCipherService tokenCipherService;

    public YaadeUserSyncService(UserRepository userRepository,
                                ProjectRepository projectRepository,
                                PlatformYaadeProjectBindingRepository projectBindingRepository,
                                PlatformYaadeUserBindingRepository userBindingRepository,
                                ProjectDataPermissionService projectDataPermissionService,
                                YaadeClientService yaadeClientService,
                                YaadeProperties yaadeProperties,
                                TokenCipherService tokenCipherService) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.projectBindingRepository = projectBindingRepository;
        this.userBindingRepository = userBindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.yaadeClientService = yaadeClientService;
        this.yaadeProperties = yaadeProperties;
        this.tokenCipherService = tokenCipherService;
    }

    @Transactional
    public YaadeAuthenticatedUserSession loginCurrentUserWithSyncedGroups(ProjectEntity selectedProject) {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        LinkedHashSet<String> groups = resolveVisibleGroups(user, selectedProject);
        return ensureManagedUserSession(user, groups);
    }

    @Transactional
    public YaadeAuthenticatedUserSession reauthenticateManagedUser(Long userId) {
        UserEntity user = userRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        PlatformYaadeUserBindingEntity binding = userBindingRepository.findByUserId(userId)
                .orElseThrow(() -> new UnauthorizedException("Yaade user binding not found"));
        String password = tokenCipherService.decrypt(binding.getPasswordCiphertext());
        try {
            return new YaadeAuthenticatedUserSession(
                    binding.getYaadeUsername(),
                    yaadeClientService.login(binding.getYaadeUsername(), password),
                    binding.getYaadeUserId()
            );
        } catch (RuntimeException ex) {
            YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
            yaadeClientService.resetUserPassword(adminSession, binding.getYaadeUserId());
            String rotatedPassword = rotateManagedPasswordAfterReset(binding.getYaadeUsername(), yaadeProperties.getDefaultUserPassword(), ex);
            binding.setPasswordCiphertext(tokenCipherService.encrypt(rotatedPassword));
            binding.setLastSyncedAt(LocalDateTime.now());
            userBindingRepository.save(binding);
            return new YaadeAuthenticatedUserSession(
                    binding.getYaadeUsername(),
                    yaadeClientService.login(binding.getYaadeUsername(), rotatedPassword),
                    binding.getYaadeUserId()
            );
        }
    }

    private LinkedHashSet<String> resolveVisibleGroups(UserEntity user, ProjectEntity selectedProject) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        LinkedHashSet<String> groups = new LinkedHashSet<>();
        groups.add(yaadeProperties.getPublicGroupName());
        if (selectedProject != null) {
            projectDataPermissionService.requireProjectVisible(selectedProject, scope);
            projectBindingRepository.findByProjectId(selectedProject.getId())
                    .filter(binding -> YaadeProjectSyncService.STATUS_ACTIVE.equalsIgnoreCase(binding.getStatus()))
                    .map(PlatformYaadeProjectBindingEntity::getYaadeGroupName)
                    .filter(groupName -> groupName != null && !groupName.isBlank())
                    .ifPresent(groups::add);
            return groups;
        }
        List<ProjectEntity> projects = projectRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
        List<PlatformYaadeProjectBindingEntity> bindings = projectBindingRepository.findAllByStatusOrderByProjectIdAsc(YaadeProjectSyncService.STATUS_ACTIVE);
        for (ProjectEntity project : projects) {
            if (!projectDataPermissionService.isProjectVisible(project, scope)) {
                continue;
            }
            bindings.stream()
                    .filter(binding -> Objects.equals(binding.getProjectId(), project.getId()))
                    .findFirst()
                    .ifPresent(binding -> groups.add(binding.getYaadeGroupName()));
        }
        return groups;
    }

    private YaadeAuthenticatedUserSession ensureManagedUserSession(UserEntity user, Set<String> targetGroups) {
        String managedUsername = yaadeProperties.managedUsername(user.getId());
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        List<YaadeClientService.YaadeRemoteUser> remoteUsers = yaadeClientService.listUsers(adminSession);
        PlatformYaadeUserBindingEntity binding = userBindingRepository.findByUserId(user.getId()).orElse(null);
        YaadeClientService.YaadeRemoteUser remoteUser = resolveRemoteUser(binding, managedUsername, remoteUsers, adminSession, targetGroups);
        syncGroupsIfNeeded(adminSession, remoteUser, targetGroups);
        removeStaleConflictingBindings(binding, user.getId(), remoteUser.id(), managedUsername);

        String password = binding == null ? null : tokenCipherService.decrypt(binding.getPasswordCiphertext());
        if (password == null || password.isBlank()) {
            yaadeClientService.resetUserPassword(adminSession, remoteUser.id());
            password = rotateManagedPasswordAfterReset(managedUsername, yaadeProperties.getDefaultUserPassword(), null);
        }

        YaadeClientService.YaadeSession userSession;
        try {
            userSession = yaadeClientService.login(managedUsername, password);
        } catch (RuntimeException ex) {
            yaadeClientService.resetUserPassword(adminSession, remoteUser.id());
            password = rotateManagedPasswordAfterReset(managedUsername, yaadeProperties.getDefaultUserPassword(), ex);
            userSession = yaadeClientService.login(managedUsername, password);
        }

        PlatformYaadeUserBindingEntity entity = binding == null ? new PlatformYaadeUserBindingEntity() : binding;
        entity.setUserId(user.getId());
        entity.setYaadeUserId(remoteUser.id());
        entity.setYaadeUsername(managedUsername);
        entity.setPasswordCiphertext(tokenCipherService.encrypt(password));
        entity.setLastSyncedAt(LocalDateTime.now());
        userBindingRepository.save(entity);
        return new YaadeAuthenticatedUserSession(managedUsername, userSession, remoteUser.id());
    }

    private YaadeClientService.YaadeRemoteUser resolveRemoteUser(PlatformYaadeUserBindingEntity binding,
                                                                 String managedUsername,
                                                                 List<YaadeClientService.YaadeRemoteUser> remoteUsers,
                                                                 YaadeClientService.YaadeSession adminSession,
                                                                 Set<String> targetGroups) {
        if (binding != null) {
            YaadeClientService.YaadeRemoteUser matchedById = remoteUsers.stream()
                    .filter(item -> Objects.equals(item.id(), binding.getYaadeUserId()))
                    .findFirst()
                    .orElse(null);
            if (matchedById != null) {
                return matchedById;
            }
        }
        YaadeClientService.YaadeRemoteUser matchedByName = remoteUsers.stream()
                .filter(item -> Objects.equals(item.username(), managedUsername))
                .findFirst()
                .orElse(null);
        if (matchedByName != null) {
            return matchedByName;
        }
        return yaadeClientService.createUser(adminSession, managedUsername, new ArrayList<>(targetGroups));
    }

    /**
     * Yaade 远端用户名 `aiclub-{userId}` 是受管账号归属的事实来源。
     * 线上历史数据可能保留了指向同一远端用户 ID 的旧绑定，必须先删除并 flush，
     * 避免当前用户绑定更新 yaade_user_id 时撞上唯一索引。
     */
    private void removeStaleConflictingBindings(PlatformYaadeUserBindingEntity currentBinding,
                                                Long currentUserId,
                                                Long yaadeUserId,
                                                String yaadeUsername) {
        List<PlatformYaadeUserBindingEntity> staleBindings = userBindingRepository
                .findAllByYaadeUserIdOrYaadeUsername(yaadeUserId, yaadeUsername)
                .stream()
                .filter(candidate -> !isCurrentBinding(candidate, currentBinding, currentUserId))
                .toList();
        if (staleBindings.isEmpty()) {
            return;
        }
        userBindingRepository.deleteAll(staleBindings);
        userBindingRepository.flush();
    }

    private boolean isCurrentBinding(PlatformYaadeUserBindingEntity candidate,
                                     PlatformYaadeUserBindingEntity currentBinding,
                                     Long currentUserId) {
        if (candidate == null) {
            return false;
        }
        if (Objects.equals(candidate.getUserId(), currentUserId)) {
            return true;
        }
        return currentBinding != null
                && currentBinding.getId() != null
                && Objects.equals(candidate.getId(), currentBinding.getId());
    }

    private void syncGroupsIfNeeded(YaadeClientService.YaadeSession adminSession,
                                    YaadeClientService.YaadeRemoteUser remoteUser,
                                    Set<String> targetGroups) {
        LinkedHashSet<String> currentGroups = new LinkedHashSet<>(remoteUser.groups());
        LinkedHashSet<String> normalizedTargetGroups = new LinkedHashSet<>(targetGroups);
        if (currentGroups.equals(normalizedTargetGroups)) {
            return;
        }
        yaadeClientService.updateUserGroups(adminSession, remoteUser.id(), remoteUser.withGroups(new ArrayList<>(normalizedTargetGroups)));
    }

    private String rotateManagedPassword(String username, String currentPassword) {
        String nextPassword = randomPassword();
        YaadeClientService.YaadeSession session = yaadeClientService.login(username, currentPassword);
        yaadeClientService.changeOwnPassword(session, currentPassword, nextPassword);
        return nextPassword;
    }

    /**
     * 只有在 Yaade 管理员已执行 resetpassword 之后才会调用这里。
     * 如果此时仍无法用默认密码登录，基本可以判定为平台侧默认密码与 Yaade 服务端默认密码不一致。
     */
    private String rotateManagedPasswordAfterReset(String username, String currentPassword, RuntimeException cause) {
        try {
            return rotateManagedPassword(username, currentPassword);
        } catch (RuntimeException exception) {
            IllegalStateException mismatch = new IllegalStateException(DEFAULT_PASSWORD_MISMATCH_MESSAGE, exception);
            if (cause != null) {
                mismatch.addSuppressed(cause);
            }
            throw mismatch;
        }
    }

    private String randomPassword() {
        byte[] bytes = new byte[24];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public record YaadeAuthenticatedUserSession(
            String username,
            YaadeClientService.YaadeSession session,
            Long yaadeUserId
    ) {
    }
}
