package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/**
 * 统一封装项目级数据权限判定，并按当前用户启用角色实时合并数据权限配置。
 * 项目绑定资源默认复用这里的“项目可见/项目参与人”判断，避免在智能体、执行中心、GitLab、CI/CD 等模块重复维护数据权限模型。
 */
@Service
public class ProjectDataPermissionService {

    private static final String SUPER_ADMIN_ROLE = "SUPER_ADMIN";

    /**
     * 与当前系统既有规则一致的默认项目可见范围。
     */
    private static final DataPermissionScopeType DEFAULT_PROJECT_VISIBILITY_SCOPE = DataPermissionScopeType.PROJECT_PARTICIPANT;

    /**
     * 与当前系统既有规则一致的默认项目维护范围。
     */
    private static final DataPermissionScopeType DEFAULT_PROJECT_MANAGE_SCOPE = DataPermissionScopeType.OWNER_OR_CREATOR;

    /**
     * 与当前系统既有规则一致的默认迭代删除范围。
     */
    private static final DataPermissionScopeType DEFAULT_ITERATION_DELETE_SCOPE = DataPermissionScopeType.CREATOR_ONLY;

    /**
     * 与当前系统既有规则一致的默认工作项删除范围。
     */
    private static final DataPermissionScopeType DEFAULT_TASK_DELETE_SCOPE = DataPermissionScopeType.CREATOR_ONLY;

    private final UserRepository userRepository;

    public ProjectDataPermissionService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 读取当前登录用户的实时数据权限上下文。
     */
    public ProjectDataScope requireCurrentScope() {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return buildScope(authContext.userId());
    }

    /**
     * 读取当前登录用户的实时数据权限上下文；若当前线程无登录态则返回空。
     */
    public ProjectDataScope currentScopeOrNull() {
        return AuthContextHolder.get()
                .map(authContext -> buildScope(authContext.userId()))
                .orElse(null);
    }

    /**
     * 判断当前用户是否可以查看指定项目。
     */
    public boolean isProjectVisible(ProjectEntity project) {
        return isProjectVisible(project, requireCurrentScope());
    }

    /**
     * 判断指定上下文是否可以查看项目。
     */
    public boolean isProjectVisible(ProjectEntity project, ProjectDataScope scope) {
        if (project == null || scope == null) {
            return false;
        }
        if (scope.superAdmin()) {
            return true;
        }
        return matchesProjectScope(scope.policy().projectVisibilityScope(), project, scope.userId());
    }

    /**
     * 强制要求当前用户拥有项目查看权限。
     */
    public void requireProjectVisible(ProjectEntity project) {
        requireProjectVisible(project, requireCurrentScope());
    }

    /**
     * 强制要求指定上下文拥有项目查看权限。
     */
    public void requireProjectVisible(ProjectEntity project, ProjectDataScope scope) {
        if (!isProjectVisible(project, scope)) {
            throw new ForbiddenException("无权访问当前项目数据");
        }
    }

    /**
     * 判断当前用户是否可以编辑或删除项目。
     */
    public boolean canEditProject(ProjectEntity project) {
        return canEditProject(project, requireCurrentScope());
    }

    /**
     * 判断指定上下文是否可以编辑或删除项目。
     */
    public boolean canEditProject(ProjectEntity project, ProjectDataScope scope) {
        if (project == null || scope == null) {
            return false;
        }
        if (scope.superAdmin()) {
            return true;
        }
        return matchesProjectScope(scope.policy().projectManageScope(), project, scope.userId());
    }

    /**
     * 强制要求当前用户拥有项目编辑权限。
     */
    public void requireProjectEditable(ProjectEntity project) {
        requireProjectEditable(project, requireCurrentScope());
    }

    /**
     * 强制要求指定上下文拥有项目编辑权限。
     */
    public void requireProjectEditable(ProjectEntity project, ProjectDataScope scope) {
        if (!canEditProject(project, scope)) {
            throw new ForbiddenException("当前角色配置不允许维护项目");
        }
    }

    /**
     * 强制要求当前用户可以访问指定迭代。
     */
    public void requireIterationVisible(IterationEntity iteration) {
        requireProjectVisible(iteration.getProject());
    }

    /**
     * 判断当前用户是否可以删除迭代。
     */
    public boolean canDeleteIteration(IterationEntity iteration) {
        return canDeleteIteration(iteration, requireCurrentScope());
    }

    /**
     * 判断指定上下文是否可以删除迭代。
     */
    public boolean canDeleteIteration(IterationEntity iteration, ProjectDataScope scope) {
        if (iteration == null || scope == null) {
            return false;
        }
        if (scope.superAdmin()) {
            return true;
        }
        return matchesResourceScope(scope.policy().iterationDeleteScope(), iteration.getProject(), iteration.getCreatorUser(), scope.userId());
    }

    /**
     * 强制要求当前用户可以删除指定迭代。
     */
    public void requireIterationDeletable(IterationEntity iteration) {
        requireIterationDeletable(iteration, requireCurrentScope());
    }

    /**
     * 强制要求指定上下文可以删除指定迭代。
     */
    public void requireIterationDeletable(IterationEntity iteration, ProjectDataScope scope) {
        if (!canDeleteIteration(iteration, scope)) {
            throw new ForbiddenException("当前角色配置不允许删除该迭代");
        }
    }

    /**
     * 强制要求当前用户可以访问指定工作项。
     */
    public void requireTaskVisible(TaskEntity task) {
        requireProjectVisible(task.getProject());
    }

    /**
     * 判断当前用户是否可以删除工作项。
     */
    public boolean canDeleteTask(TaskEntity task) {
        return canDeleteTask(task, requireCurrentScope());
    }

    /**
     * 判断指定上下文是否可以删除工作项。
     */
    public boolean canDeleteTask(TaskEntity task, ProjectDataScope scope) {
        if (task == null || scope == null) {
            return false;
        }
        if (scope.superAdmin()) {
            return true;
        }
        return matchesResourceScope(scope.policy().taskDeleteScope(), task.getProject(), task.getCreatorUser(), scope.userId());
    }

    /**
     * 强制要求当前用户可以删除指定工作项。
     */
    public void requireTaskDeletable(TaskEntity task) {
        requireTaskDeletable(task, requireCurrentScope());
    }

    /**
     * 强制要求指定上下文可以删除指定工作项。
     */
    public void requireTaskDeletable(TaskEntity task, ProjectDataScope scope) {
        if (!canDeleteTask(task, scope)) {
            throw new ForbiddenException("当前角色配置不允许删除该工作项");
        }
    }

    /**
     * 强制要求当前用户可以访问指定 Agent。
     */
    public void requireAgentVisible(AgentEntity agent) {
        if (agent == null) {
            return;
        }
        if (agent.getProject() != null) {
            requireProjectVisible(agent.getProject());
        }
    }

    /**
     * 强制要求当前用户可以访问指定 GitLab 绑定。
     */
    public void requireGitlabBindingVisible(ProjectGitlabBindingEntity binding) {
        requireProjectVisible(binding.getProject());
    }

    /**
     * 强制要求当前用户可以访问指定流水线绑定。
     */
    public void requirePipelineBindingVisible(ProjectPipelineBindingEntity binding) {
        requireProjectVisible(binding.getProject());
    }

    /**
     * 汇总项目参与人，用于前端候选集与服务端成员校验复用。
     */
    public Set<Long> resolveParticipantUserIds(ProjectEntity project) {
        LinkedHashSet<Long> participantUserIds = new LinkedHashSet<>();
        if (project == null) {
            return participantUserIds;
        }
        if (project.getOwnerUser() != null) {
            participantUserIds.add(project.getOwnerUser().getId());
        }
        if (project.getCreatorUser() != null) {
            participantUserIds.add(project.getCreatorUser().getId());
        }
        project.getMembers().stream().map(UserEntity::getId).forEach(participantUserIds::add);
        return participantUserIds;
    }

    /**
     * 校验负责人或协作人是否属于当前项目参与人范围。
     */
    public void requireProjectParticipant(ProjectEntity project, UserEntity user, String label) {
        if (user == null) {
            return;
        }
        if (!resolveParticipantUserIds(project).contains(user.getId())) {
            throw new IllegalArgumentException(label + "必须属于当前项目负责人或项目成员");
        }
    }

    /**
     * 读取最新用户角色并构建当前请求的数据权限上下文，确保角色配置改动可在下一次请求立即生效。
     */
    private ProjectDataScope buildScope(Long userId) {
        UserEntity user = userRepository.findWithDetailsById(userId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));
        List<RoleEntity> enabledRoles = user.getRoles().stream()
                .filter(RoleEntity::isEnabled)
                .toList();
        boolean superAdmin = enabledRoles.stream()
                .map(RoleEntity::getCode)
                .anyMatch(code -> SUPER_ADMIN_ROLE.equalsIgnoreCase(code));
        return new ProjectDataScope(
                userId,
                superAdmin,
                mergePolicy(enabledRoles)
        );
    }

    /**
     * 将多个角色的数据权限按并集规则归并成当前用户的最终数据权限策略。
     */
    private DataPermissionPolicy mergePolicy(List<RoleEntity> roles) {
        return new DataPermissionPolicy(
                mergeScope(roles, RoleEntity::getProjectVisibilityScope, DEFAULT_PROJECT_VISIBILITY_SCOPE),
                mergeScope(roles, RoleEntity::getProjectManageScope, DEFAULT_PROJECT_MANAGE_SCOPE),
                mergeScope(roles, RoleEntity::getIterationDeleteScope, DEFAULT_ITERATION_DELETE_SCOPE),
                mergeScope(roles, RoleEntity::getTaskDeleteScope, DEFAULT_TASK_DELETE_SCOPE)
        );
    }

    /**
     * 固定枚举的并集策略：
     * ALL > PROJECT_PARTICIPANT > OWNER_OR_CREATOR > OWNER_ONLY / CREATOR_ONLY > NONE。
     */
    private DataPermissionScopeType mergeScope(List<RoleEntity> roles,
                                               Function<RoleEntity, DataPermissionScopeType> extractor,
                                               DataPermissionScopeType defaultValue) {
        boolean allowOwner = false;
        boolean allowCreator = false;
        boolean allowParticipant = false;
        boolean allowAll = false;

        for (RoleEntity role : roles) {
            DataPermissionScopeType scopeType = normalizeScope(extractor.apply(role), defaultValue);
            switch (scopeType) {
                case ALL -> allowAll = true;
                case PROJECT_PARTICIPANT -> allowParticipant = true;
                case OWNER_OR_CREATOR -> {
                    allowOwner = true;
                    allowCreator = true;
                }
                case OWNER_ONLY -> allowOwner = true;
                case CREATOR_ONLY -> allowCreator = true;
                case NONE -> {
                    // `NONE` 不额外提升权限。
                }
            }
        }

        if (allowAll) {
            return DataPermissionScopeType.ALL;
        }
        if (allowParticipant) {
            return DataPermissionScopeType.PROJECT_PARTICIPANT;
        }
        if (allowOwner && allowCreator) {
            return DataPermissionScopeType.OWNER_OR_CREATOR;
        }
        if (allowOwner) {
            return DataPermissionScopeType.OWNER_ONLY;
        }
        if (allowCreator) {
            return DataPermissionScopeType.CREATOR_ONLY;
        }
        return DataPermissionScopeType.NONE;
    }

    /**
     * 对单个枚举值做空值兜底，兼容迁移窗口或历史测试构造数据。
     */
    private DataPermissionScopeType normalizeScope(DataPermissionScopeType scopeType, DataPermissionScopeType defaultValue) {
        return scopeType == null ? defaultValue : scopeType;
    }

    /**
     * 计算项目本身的权限命中关系。
     */
    private boolean matchesProjectScope(DataPermissionScopeType scopeType, ProjectEntity project, Long userId) {
        return switch (scopeType) {
            case NONE -> false;
            case OWNER_ONLY -> matchesUser(project.getOwnerUser(), userId);
            case CREATOR_ONLY -> matchesUser(project.getCreatorUser(), userId);
            case OWNER_OR_CREATOR -> matchesUser(project.getOwnerUser(), userId) || matchesUser(project.getCreatorUser(), userId);
            case PROJECT_PARTICIPANT -> resolveParticipantUserIds(project).contains(userId);
            case ALL -> true;
        };
    }

    /**
     * 计算依赖项目负责人与资源创建人的权限命中关系。
     */
    private boolean matchesResourceScope(DataPermissionScopeType scopeType,
                                         ProjectEntity project,
                                         UserEntity resourceCreator,
                                         Long userId) {
        return switch (scopeType) {
            case NONE -> false;
            case OWNER_ONLY -> matchesUser(project.getOwnerUser(), userId);
            case CREATOR_ONLY -> matchesUser(resourceCreator, userId);
            case OWNER_OR_CREATOR -> matchesUser(project.getOwnerUser(), userId) || matchesUser(resourceCreator, userId);
            case PROJECT_PARTICIPANT -> resolveParticipantUserIds(project).contains(userId);
            case ALL -> true;
        };
    }

    private boolean matchesUser(UserEntity user, Long userId) {
        return user != null && user.getId() != null && user.getId().equals(userId);
    }

    /**
     * 当前请求最终生效的数据权限策略。
     */
    public record DataPermissionPolicy(
            DataPermissionScopeType projectVisibilityScope,
            DataPermissionScopeType projectManageScope,
            DataPermissionScopeType iterationDeleteScope,
            DataPermissionScopeType taskDeleteScope
    ) {
    }

    /**
     * 项目数据权限判定所需的最小实时上下文。
     */
    public record ProjectDataScope(
            Long userId,
            boolean superAdmin,
            DataPermissionPolicy policy
    ) {
    }
}
