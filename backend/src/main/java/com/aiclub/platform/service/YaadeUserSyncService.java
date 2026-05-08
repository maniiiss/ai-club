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
            String rotatedPassword = rotateManagedPassword(binding.getYaadeUsername(), yaadeProperties.getDefaultUserPassword());
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

        String password = binding == null ? null : tokenCipherService.decrypt(binding.getPasswordCiphertext());
        if (password == null || password.isBlank()) {
            yaadeClientService.resetUserPassword(adminSession, remoteUser.id());
            password = rotateManagedPassword(managedUsername, yaadeProperties.getDefaultUserPassword());
        }

        YaadeClientService.YaadeSession userSession;
        try {
            userSession = yaadeClientService.login(managedUsername, password);
        } catch (RuntimeException ex) {
            yaadeClientService.resetUserPassword(adminSession, remoteUser.id());
            password = rotateManagedPassword(managedUsername, yaadeProperties.getDefaultUserPassword());
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
