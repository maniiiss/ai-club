package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PermissionEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PermissionSummary;
import com.aiclub.platform.dto.RoleSummary;
import com.aiclub.platform.dto.UserOptionSummary;
import com.aiclub.platform.dto.UserSummary;
import com.aiclub.platform.dto.request.PermissionRequest;
import com.aiclub.platform.dto.request.ResetPasswordRequest;
import com.aiclub.platform.dto.request.RoleRequest;
import com.aiclub.platform.dto.request.UserRequest;
import com.aiclub.platform.repository.PermissionRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class AccessManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;

    public AccessManagementService(UserRepository userRepository,
                                   RoleRepository roleRepository,
                                   PermissionRepository permissionRepository,
                                   PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public PageResponse<UserSummary> pageUsers(int page, int size, String keyword, Boolean enabled, Long roleId) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<UserSummary> pageData = userRepository.findAll(userSpecification(keyword, enabled, roleId), pageable)
                .map(this::toUserSummary);
        return PageResponse.from(pageData);
    }

    public List<UserOptionSummary> listUserOptions() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(UserEntity::isEnabled)
                .map(this::toUserOptionSummary)
                .toList();
    }

    public List<RoleSummary> listRoleOptions() {
        return roleRepository.findAllByOrderByIdAsc().stream()
                .map(this::toRoleSummary)
                .toList();
    }

    public List<PermissionSummary> listPermissionOptions() {
        return permissionRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(this::toPermissionSummary)
                .toList();
    }

    @Transactional
    public UserSummary createUser(UserRequest request) {
        if (userRepository.existsByUsernameIgnoreCase(request.username())) {
            throw new IllegalArgumentException("Username already exists");
        }
        if (request.password() == null || request.password().isBlank()) {
            throw new IllegalArgumentException("Initial password is required when creating a user");
        }

        UserEntity entity = new UserEntity();
        entity.setUsername(request.username().trim());
        entity.setNickname(request.nickname().trim());
        entity.setEmail(defaultString(request.email()));
        entity.setPhone(defaultString(request.phone()));
        entity.setGitlabUsername(defaultString(request.gitlabUsername()));
        applyGiteeMemberBinding(entity, request);
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setPasswordHash(passwordEncoder.encode(request.password().trim()));
        entity.setRoles(resolveRoles(request.roleIds()));
        return toUserSummary(userRepository.save(entity));
    }

    @Transactional
    public UserSummary updateUser(Long id, UserRequest request) {
        UserEntity entity = requireUser(id);
        if (userRepository.existsByUsernameIgnoreCaseAndIdNot(request.username(), id)) {
            throw new IllegalArgumentException("Username already exists");
        }
        entity.setUsername(request.username().trim());
        entity.setNickname(request.nickname().trim());
        entity.setEmail(defaultString(request.email()));
        entity.setPhone(defaultString(request.phone()));
        entity.setGitlabUsername(defaultString(request.gitlabUsername()));
        applyGiteeMemberBinding(entity, request);
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setRoles(resolveRoles(request.roleIds()));

        if (entity.isBuiltIn()) {
            entity.setEnabled(true);
        }
        return toUserSummary(userRepository.save(entity));
    }

    @Transactional
    public void deleteUser(Long id) {
        UserEntity entity = requireUser(id);
        if (entity.isBuiltIn()) {
            throw new IllegalArgumentException("Built-in users cannot be deleted");
        }
        userRepository.delete(entity);
    }

    @Transactional
    public void resetPassword(Long id, ResetPasswordRequest request) {
        UserEntity entity = requireUser(id);
        entity.setPasswordHash(passwordEncoder.encode(request.password().trim()));
        userRepository.save(entity);
    }

    public PageResponse<RoleSummary> pageRoles(int page, int size, String keyword, Boolean enabled) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<RoleSummary> pageData = roleRepository.findAll(roleSpecification(keyword, enabled), pageable)
                .map(this::toRoleSummary);
        return PageResponse.from(pageData);
    }

    @Transactional
    public RoleSummary createRole(RoleRequest request) {
        if (roleRepository.existsByCodeIgnoreCase(request.code())) {
            throw new IllegalArgumentException("Role code already exists");
        }

        RoleEntity entity = new RoleEntity();
        entity.setName(request.name().trim());
        entity.setCode(request.code().trim());
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setDescription(defaultString(request.description()));
        entity.setProjectVisibilityScope(request.projectVisibilityScope());
        entity.setProjectManageScope(request.projectManageScope());
        entity.setIterationDeleteScope(request.iterationDeleteScope());
        entity.setTaskDeleteScope(request.taskDeleteScope());
        entity.setPermissions(resolvePermissions(request.permissionIds()));
        return toRoleSummary(roleRepository.save(entity));
    }

    @Transactional
    public RoleSummary updateRole(Long id, RoleRequest request) {
        RoleEntity entity = requireRole(id);
        if (roleRepository.existsByCodeIgnoreCaseAndIdNot(request.code(), id)) {
            throw new IllegalArgumentException("Role code already exists");
        }

        entity.setName(request.name().trim());
        if (!entity.isBuiltIn()) {
            entity.setCode(request.code().trim());
            entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        } else {
            entity.setEnabled(true);
        }
        entity.setDescription(defaultString(request.description()));
        entity.setProjectVisibilityScope(request.projectVisibilityScope());
        entity.setProjectManageScope(request.projectManageScope());
        entity.setIterationDeleteScope(request.iterationDeleteScope());
        entity.setTaskDeleteScope(request.taskDeleteScope());
        entity.setPermissions(resolvePermissions(request.permissionIds()));
        return toRoleSummary(roleRepository.save(entity));
    }

    @Transactional
    public void deleteRole(Long id) {
        RoleEntity entity = requireRole(id);
        if (entity.isBuiltIn()) {
            throw new IllegalArgumentException("Built-in roles cannot be deleted");
        }
        roleRepository.delete(entity);
    }

    public PageResponse<PermissionSummary> pagePermissions(int page, int size, String keyword, String type, Boolean enabled) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "sortOrder").and(Sort.by("id")));
        Page<PermissionSummary> pageData = permissionRepository.findAll(permissionSpecification(keyword, type, enabled), pageable)
                .map(this::toPermissionSummary);
        return PageResponse.from(pageData);
    }

    @Transactional
    public PermissionSummary createPermission(PermissionRequest request) {
        validatePermissionRequest(request, null);

        PermissionEntity entity = new PermissionEntity();
        fillPermissionEntity(entity, request, false);
        return toPermissionSummary(permissionRepository.save(entity));
    }

    @Transactional
    public PermissionSummary updatePermission(Long id, PermissionRequest request) {
        PermissionEntity entity = requirePermission(id);
        validatePermissionRequest(request, id);
        fillPermissionEntity(entity, request, entity.isBuiltIn());
        return toPermissionSummary(permissionRepository.save(entity));
    }

    @Transactional
    public void deletePermission(Long id) {
        PermissionEntity entity = requirePermission(id);
        if (entity.isBuiltIn()) {
            throw new IllegalArgumentException("Built-in permissions cannot be deleted");
        }
        if (permissionRepository.count((root, query, cb) -> cb.equal(root.get("parentId"), id)) > 0) {
            throw new IllegalArgumentException("Please delete child permissions first");
        }
        permissionRepository.delete(entity);
    }

    @Transactional
    public void updateUserLastLogin(Long userId) {
        UserEntity user = requireUser(userId);
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);
    }

    public UserEntity requireUser(Long id) {
        return userRepository.findWithDetailsById(id)
                .orElseThrow(() -> new NoSuchElementException("User not found: " + id));
    }

    public RoleEntity requireRole(Long id) {
        return roleRepository.findWithPermissionsById(id)
                .orElseThrow(() -> new NoSuchElementException("Role not found: " + id));
    }

    public PermissionEntity requirePermission(Long id) {
        return permissionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Permission not found: " + id));
    }

    private void validatePermissionRequest(PermissionRequest request, Long id) {
        if (id == null) {
            if (permissionRepository.existsByCodeIgnoreCase(request.code())) {
                throw new IllegalArgumentException("Permission code already exists");
            }
        } else if (permissionRepository.existsByCodeIgnoreCaseAndIdNot(request.code(), id)) {
            throw new IllegalArgumentException("Permission code already exists");
        }

        if (request.parentId() != null && request.parentId().equals(id)) {
            throw new IllegalArgumentException("A permission cannot be its own parent");
        }
        if (!"MENU".equalsIgnoreCase(request.type()) && !"ACTION".equalsIgnoreCase(request.type())) {
            throw new IllegalArgumentException("Permission type only supports MENU or ACTION");
        }
        if (request.parentId() != null) {
            requirePermission(request.parentId());
        }
    }

    private void fillPermissionEntity(PermissionEntity entity, PermissionRequest request, boolean keepCode) {
        entity.setName(request.name().trim());
        if (!keepCode) {
            entity.setCode(request.code().trim());
        }
        entity.setType(request.type().trim().toUpperCase());
        entity.setPath(blankToNull(request.path()));
        entity.setComponent(blankToNull(request.component()));
        entity.setIcon(defaultString(request.icon()));
        entity.setParentId(request.parentId());
        entity.setSortOrder(request.sortOrder());
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setDescription(defaultString(request.description()));
        if (entity.isBuiltIn()) {
            entity.setEnabled(true);
        }
    }

    private Set<RoleEntity> resolveRoles(List<Long> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) {
            return new LinkedHashSet<>();
        }
        return new LinkedHashSet<>(roleRepository.findAllById(roleIds));
    }

    private Set<PermissionEntity> resolvePermissions(List<Long> permissionIds) {
        if (permissionIds == null || permissionIds.isEmpty()) {
            return new LinkedHashSet<>();
        }
        return new LinkedHashSet<>(permissionRepository.findAllById(permissionIds));
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private Specification<UserEntity> userSpecification(String keyword, Boolean enabled, Long roleId) {
        return (root, query, cb) -> {
            if (query != null) {
                query.distinct(true);
            }
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("username")), pattern),
                        cb.like(cb.lower(root.get("nickname")), pattern),
                        cb.like(cb.lower(root.get("email")), pattern),
                        cb.like(cb.lower(root.get("phone")), pattern),
                        cb.like(cb.lower(root.get("gitlabUsername")), pattern),
                        cb.like(cb.lower(root.get("giteeUsername")), pattern),
                        cb.like(cb.lower(root.get("giteeName")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            if (roleId != null) {
                predicates.add(cb.equal(root.join("roles", JoinType.LEFT).get("id"), roleId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<RoleEntity> roleSpecification(String keyword, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("code")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<PermissionEntity> permissionSpecification(String keyword, String type, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("code")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (hasText(type)) {
                predicates.add(cb.equal(root.get("type"), type.trim().toUpperCase()));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private UserSummary toUserSummary(UserEntity entity) {
        List<RoleEntity> roles = entity.getRoles().stream()
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .toList();
        return new UserSummary(
                entity.getId(),
                entity.getUsername(),
                entity.getNickname(),
                entity.getEmail(),
                entity.getPhone(),
                entity.getGitlabUsername(),
                entity.getGiteeMemberId(),
                entity.getGiteeUsername(),
                entity.getGiteeName(),
                entity.isEnabled(),
                entity.isBuiltIn(),
                entity.getLastLoginAt() == null ? null : entity.getLastLoginAt().format(TIME_FORMATTER),
                roles.stream().map(RoleEntity::getId).toList(),
                roles.stream().map(RoleEntity::getCode).toList(),
                roles.stream().map(RoleEntity::getName).toList()
        );
    }

    /**
     * 将用户实体映射为前端下拉和列表共用的轻量选项，同时补充真实头像地址。
     */
    private UserOptionSummary toUserOptionSummary(UserEntity entity) {
        return new UserOptionSummary(
                entity.getId(),
                entity.getUsername(),
                entity.getNickname(),
                entity.getAvatarUrl(),
                entity.isEnabled()
        );
    }

    /**
     * 保存用户与 Gitee 企业成员的快照映射；清空成员ID时同步清空展示字段。
     */
    private void applyGiteeMemberBinding(UserEntity entity, UserRequest request) {
        if (request.giteeMemberId() == null) {
            entity.setGiteeMemberId(null);
            entity.setGiteeUsername("");
            entity.setGiteeName("");
            return;
        }
        entity.setGiteeMemberId(request.giteeMemberId());
        entity.setGiteeUsername(defaultString(request.giteeUsername()));
        entity.setGiteeName(defaultString(request.giteeName()));
    }

    private RoleSummary toRoleSummary(RoleEntity entity) {
        List<PermissionEntity> permissions = entity.getPermissions().stream()
                .sorted((a, b) -> {
                    int sortCompare = Integer.compare(a.getSortOrder(), b.getSortOrder());
                    return sortCompare != 0 ? sortCompare : Long.compare(a.getId(), b.getId());
                })
                .toList();
        return new RoleSummary(
                entity.getId(),
                entity.getName(),
                entity.getCode(),
                entity.isEnabled(),
                entity.isBuiltIn(),
                entity.getDescription(),
                entity.getProjectVisibilityScope(),
                entity.getProjectManageScope(),
                entity.getIterationDeleteScope(),
                entity.getTaskDeleteScope(),
                permissions.stream().map(PermissionEntity::getId).toList(),
                permissions.stream().map(PermissionEntity::getCode).toList(),
                permissions.stream().map(PermissionEntity::getName).toList()
        );
    }

    private PermissionSummary toPermissionSummary(PermissionEntity entity) {
        return new PermissionSummary(
                entity.getId(),
                entity.getName(),
                entity.getCode(),
                entity.getType(),
                entity.getPath(),
                entity.getComponent(),
                entity.getIcon(),
                entity.getParentId(),
                entity.getSortOrder(),
                entity.isEnabled(),
                entity.isBuiltIn(),
                entity.getDescription()
        );
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String blankToNull(String value) {
        String result = defaultString(value);
        return result.isBlank() ? null : result;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
