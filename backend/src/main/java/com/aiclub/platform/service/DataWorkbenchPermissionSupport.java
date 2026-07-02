package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.exception.ForbiddenException;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * DataWorkbench 数据权限辅助。
 * 业务意图：DataWorkbench 每条工单都绑定项目，但不同实体可以配置请求、执行和回滚所需的数据范围。
 */
@Component
public class DataWorkbenchPermissionSupport {

    private final ProjectDataPermissionService projectDataPermissionService;

    public DataWorkbenchPermissionSupport(ProjectDataPermissionService projectDataPermissionService) {
        this.projectDataPermissionService = projectDataPermissionService;
    }

    public void requireProjectScope(ProjectEntity project, DataPermissionScopeType scopeType, String message) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        if (scope.superAdmin()) {
            return;
        }
        if (!matches(scopeType, project, scope.userId())) {
            throw new ForbiddenException(message);
        }
    }

    private boolean matches(DataPermissionScopeType scopeType, ProjectEntity project, Long userId) {
        DataPermissionScopeType normalized = scopeType == null ? DataPermissionScopeType.NONE : scopeType;
        return switch (normalized) {
            case NONE -> false;
            case OWNER_ONLY -> project.getOwnerUser() != null && userId.equals(project.getOwnerUser().getId());
            case CREATOR_ONLY -> project.getCreatorUser() != null && userId.equals(project.getCreatorUser().getId());
            case OWNER_OR_CREATOR -> (project.getOwnerUser() != null && userId.equals(project.getOwnerUser().getId()))
                    || (project.getCreatorUser() != null && userId.equals(project.getCreatorUser().getId()));
            case PROJECT_PARTICIPANT -> participants(project).contains(userId);
            case ALL -> true;
        };
    }

    private Set<Long> participants(ProjectEntity project) {
        return projectDataPermissionService.resolveParticipantUserIds(project);
    }
}
