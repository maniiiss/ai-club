package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectOwnerRepoBindingEntity;
import com.aiclub.platform.dto.OwnerRepoBindingSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.OwnerRepoBindingRequest;
import com.aiclub.platform.repository.ProjectOwnerRepoBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 业主代码仓库绑定的管理服务。
 * 负责绑定的增删改查与连通性测试，凭据经 TokenCipherService 加密存储。
 * 业主仓库地址由用户独立配置（不复用平台默认 GitLab 地址），测试连接时复用 GitlabApiService。
 */
@Service
@Transactional(readOnly = true)
public class OwnerRepoBindingManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String PUSH_MODE_DIRECT = "DIRECT";
    private static final String PUSH_MODE_NEW_BRANCH = "NEW_BRANCH";
    private static final String PUSH_MODE_MERGE_REQUEST = "MERGE_REQUEST";

    private final ProjectOwnerRepoBindingRepository bindingRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final GitlabApiService gitlabApiService;
    private final TokenCipherService tokenCipherService;

    public OwnerRepoBindingManagementService(ProjectOwnerRepoBindingRepository bindingRepository,
                                             ProjectRepository projectRepository,
                                             ProjectDataPermissionService projectDataPermissionService,
                                             GitlabApiService gitlabApiService,
                                             TokenCipherService tokenCipherService) {
        this.bindingRepository = bindingRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.gitlabApiService = gitlabApiService;
        this.tokenCipherService = tokenCipherService;
    }

    /**
     * 分页查询当前用户可见项目下的业主仓库绑定。
     */
    public PageResponse<OwnerRepoBindingSummary> pageBindings(int page, int size, String keyword, Long projectId) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (projectId != null) {
            requireProject(projectId);
        }
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.ASC, "id"));
        Page<OwnerRepoBindingSummary> pageData = bindingRepository.findAll(bindingSpecification(keyword, projectId, scope), pageable)
                .map(this::toBindingSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 查询指定项目下的全部业主仓库绑定（供公众端推送表单下拉使用）。
     */
    public List<OwnerRepoBindingSummary> listByProject(Long projectId) {
        ProjectEntity project = requireProject(projectId);
        return bindingRepository.findByProject_IdOrderByIdAsc(project.getId()).stream()
                .map(this::toBindingSummary)
                .toList();
    }

    @Transactional
    public OwnerRepoBindingSummary createBinding(OwnerRepoBindingRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        String apiBaseUrl = requireApiBaseUrl(request.apiBaseUrl());
        String projectRef = requireProjectRef(request.gitlabProjectRef());
        validateBindingUniqueness(project.getId(), apiBaseUrl, projectRef, null);
        ProjectOwnerRepoBindingEntity entity = new ProjectOwnerRepoBindingEntity();
        entity.setProject(project);
        entity.setName(requireName(request.name()));
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setGitlabProjectRef(projectRef);
        entity.setDefaultTargetBranch(trimToNull(request.defaultTargetBranch()));
        entity.setDefaultPushMode(normalizePushMode(request.defaultPushMode(), PUSH_MODE_NEW_BRANCH));
        entity.setTokenCiphertext(tokenCipherService.encrypt(requireToken(request.apiToken())));
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        return toBindingSummary(bindingRepository.save(entity));
    }

    @Transactional
    public OwnerRepoBindingSummary updateBinding(Long id, OwnerRepoBindingRequest request) {
        ProjectOwnerRepoBindingEntity entity = requireBinding(id);
        ProjectEntity project = requireProject(request.projectId());
        String apiBaseUrl = requireApiBaseUrl(request.apiBaseUrl());
        String projectRef = requireProjectRef(request.gitlabProjectRef());
        validateBindingUniqueness(project.getId(), apiBaseUrl, projectRef, id);
        entity.setProject(project);
        entity.setName(requireName(request.name()));
        entity.setApiBaseUrl(apiBaseUrl);
        entity.setGitlabProjectRef(projectRef);
        entity.setDefaultTargetBranch(trimToNull(request.defaultTargetBranch()));
        entity.setDefaultPushMode(normalizePushMode(request.defaultPushMode(), entity.getDefaultPushMode()));
        entity.setEnabled(defaultBoolean(request.enabled(), true));
        if (hasText(request.apiToken())) {
            entity.setTokenCiphertext(tokenCipherService.encrypt(request.apiToken().trim()));
        }
        return toBindingSummary(bindingRepository.save(entity));
    }

    @Transactional
    public void deleteBinding(Long id) {
        ProjectOwnerRepoBindingEntity binding = requireBinding(id);
        bindingRepository.delete(binding);
    }

    /**
     * 测试业主仓库连通性，回写仓库元信息与测试状态。
     * 失败时仍落库 FAILED 状态后再抛出异常，不回滚状态更新。
     */
    @Transactional(noRollbackFor = RuntimeException.class)
    public OwnerRepoBindingSummary testBinding(Long id) {
        ProjectOwnerRepoBindingEntity entity = requireBinding(id);
        try {
            String token = tokenCipherService.decrypt(entity.getTokenCiphertext());
            GitlabApiService.GitlabUser user = gitlabApiService.fetchCurrentUser(entity.getApiBaseUrl(), token);
            GitlabApiService.GitlabProject project = gitlabApiService.fetchProject(entity.getApiBaseUrl(), token, entity.getGitlabProjectRef());
            entity.setGitlabProjectId(project.id());
            entity.setGitlabProjectName(project.name());
            entity.setGitlabProjectPath(project.pathWithNamespace());
            entity.setGitlabProjectWebUrl(project.webUrl());
            entity.setGitlabHttpCloneUrl(trimToNull(project.httpCloneUrl()));
            entity.setGitlabSshCloneUrl(trimToNull(project.sshCloneUrl()));
            if (!hasText(entity.getDefaultTargetBranch()) && hasText(project.defaultBranch())) {
                entity.setDefaultTargetBranch(project.defaultBranch());
            }
            return toBindingSummary(bindingRepository.save(entity));
        } catch (RuntimeException exception) {
            bindingRepository.save(entity);
            throw exception;
        }
    }

    private ProjectEntity requireProject(Long id) {
        ProjectEntity project = projectRepository.findById(id).orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    ProjectOwnerRepoBindingEntity requireBinding(Long id) {
        ProjectOwnerRepoBindingEntity binding = bindingRepository.findById(id).orElseThrow(() -> new NoSuchElementException("业主仓库绑定不存在: " + id));
        projectDataPermissionService.requireProjectVisible(binding.getProject());
        return binding;
    }

    private void validateBindingUniqueness(Long projectId, String apiBaseUrl, String projectRef, Long currentBindingId) {
        boolean duplicated = currentBindingId == null
                ? bindingRepository.existsByProject_IdAndApiBaseUrlAndGitlabProjectRef(projectId, apiBaseUrl, projectRef)
                : bindingRepository.existsByProject_IdAndApiBaseUrlAndGitlabProjectRefAndIdNot(projectId, apiBaseUrl, projectRef, currentBindingId);
        if (duplicated) {
            throw new IllegalArgumentException("当前项目已绑定该业主仓库，请勿重复创建");
        }
    }

    private Specification<ProjectOwnerRepoBindingEntity> bindingSpecification(String keyword, Long projectId,
                                                                             ProjectDataPermissionService.ProjectDataScope scope) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            appendProjectVisibilityPredicate(predicates, root.join("project", jakarta.persistence.criteria.JoinType.INNER), query, cb, scope);
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectRef")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectPath")), pattern),
                        cb.like(cb.lower(root.get("gitlabProjectName")), pattern)
                ));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 按数据权限范围过滤可见项目，逻辑与 GitlabManagementService 保持一致。
     */
    private void appendProjectVisibilityPredicate(List<Predicate> predicates,
                                                  jakarta.persistence.criteria.From<?, ProjectEntity> projectRoot,
                                                  jakarta.persistence.criteria.CriteriaQuery<?> query,
                                                  jakarta.persistence.criteria.CriteriaBuilder cb,
                                                  ProjectDataPermissionService.ProjectDataScope scope) {
        if (scope.superAdmin()) {
            return;
        }
        var visibilityScope = scope.policy().projectVisibilityScope();
        switch (visibilityScope) {
            case ALL -> {
                return;
            }
            case NONE -> predicates.add(cb.disjunction());
            case OWNER_ONLY -> predicates.add(cb.equal(projectRoot.join("ownerUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId()));
            case CREATOR_ONLY -> predicates.add(cb.equal(projectRoot.join("creatorUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId()));
            case OWNER_OR_CREATOR -> predicates.add(cb.or(
                    cb.equal(projectRoot.join("ownerUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId()),
                    cb.equal(projectRoot.join("creatorUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId())
            ));
            case PROJECT_PARTICIPANT -> {
                query.distinct(true);
                predicates.add(cb.or(
                        cb.equal(projectRoot.join("ownerUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("creatorUser", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId()),
                        cb.equal(projectRoot.join("members", jakarta.persistence.criteria.JoinType.LEFT).get("id"), scope.userId())
                ));
            }
        }
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private OwnerRepoBindingSummary toBindingSummary(ProjectOwnerRepoBindingEntity entity) {
        return new OwnerRepoBindingSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getName(),
                entity.getApiBaseUrl(),
                entity.getGitlabProjectRef(),
                entity.getGitlabProjectId(),
                entity.getGitlabProjectName(),
                entity.getGitlabProjectPath(),
                entity.getGitlabProjectWebUrl(),
                entity.getGitlabHttpCloneUrl(),
                entity.getGitlabSshCloneUrl(),
                entity.getDefaultTargetBranch(),
                entity.getDefaultPushMode(),
                hasText(entity.getTokenCiphertext()),
                defaultBoolean(entity.getEnabled(), true),
                entity.getLastPushStatus(),
                entity.getLastPushMessage(),
                formatTime(entity.getLastPushedAt()),
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt())
        );
    }

    private String requireApiBaseUrl(String value) {
        String apiBaseUrl = trimToNull(value);
        if (!hasText(apiBaseUrl)) {
            throw new IllegalArgumentException("业主仓库 GitLab API 地址不能为空");
        }
        while (apiBaseUrl.endsWith("/")) {
            apiBaseUrl = apiBaseUrl.substring(0, apiBaseUrl.length() - 1);
        }
        return apiBaseUrl;
    }

    private String requireProjectRef(String value) {
        String projectRef = trimToNull(value);
        if (!hasText(projectRef)) {
            throw new IllegalArgumentException("业主仓库 GitLab 项目标识不能为空，请填写项目 ID 或 group/path");
        }
        return projectRef;
    }

    private String requireName(String value) {
        String name = trimToNull(value);
        if (!hasText(name)) {
            throw new IllegalArgumentException("绑定名称不能为空");
        }
        return name;
    }

    private String requireToken(String value) {
        String token = trimToNull(value);
        if (!hasText(token)) {
            throw new IllegalArgumentException("业主仓库访问 Token 不能为空");
        }
        return token;
    }

    private String normalizePushMode(String value, String fallback) {
        String mode = trimToNull(value);
        if (mode == null) {
            return fallback;
        }
        mode = mode.toUpperCase();
        if (!PUSH_MODE_DIRECT.equals(mode) && !PUSH_MODE_NEW_BRANCH.equals(mode) && !PUSH_MODE_MERGE_REQUEST.equals(mode)) {
            throw new IllegalArgumentException("推送方式仅支持 DIRECT / NEW_BRANCH / MERGE_REQUEST");
        }
        return mode;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private boolean defaultBoolean(Boolean value, boolean defaultValue) {
        return value == null ? defaultValue : value;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }
}
