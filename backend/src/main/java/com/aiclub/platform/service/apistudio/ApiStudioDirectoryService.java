package com.aiclub.platform.service.apistudio;

import com.aiclub.platform.domain.model.ApiStudioDirectoryEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.apistudio.ApiStudioDirectorySummary;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointSummary;
import com.aiclub.platform.dto.apistudio.ApiStudioProjectOverview;
import com.aiclub.platform.dto.apistudio.ApiStudioProjectTree;
import com.aiclub.platform.dto.apistudio.ApiStudioTreeNode;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDirectoryReorderRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioDirectoryRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ApiStudioDirectoryRepository;
import com.aiclub.platform.repository.ApiStudioEndpointRepository;
import com.aiclub.platform.repository.ApiStudioEnvironmentRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.ProjectDataPermissionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * 原生 API 工作台 - 目录与项目入口服务。
 * 负责：目录 CRUD、拖拽排序、目录树聚合、项目概览。
 */
@Service
public class ApiStudioDirectoryService {

    private final ApiStudioDirectoryRepository directoryRepository;
    private final ApiStudioEndpointRepository endpointRepository;
    private final ApiStudioEnvironmentRepository environmentRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;

    public ApiStudioDirectoryService(ApiStudioDirectoryRepository directoryRepository,
                                     ApiStudioEndpointRepository endpointRepository,
                                     ApiStudioEnvironmentRepository environmentRepository,
                                     ProjectRepository projectRepository,
                                     ProjectDataPermissionService projectDataPermissionService) {
        this.directoryRepository = directoryRepository;
        this.endpointRepository = endpointRepository;
        this.environmentRepository = environmentRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    // ========== 项目入口 ==========

    /**
     * 加载项目并校验当前用户可见性。
     */
    public ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    /**
     * 加载项目并校验当前用户可编辑。
     */
    public ProjectEntity requireEditableProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectEditable(project);
        return project;
    }

    /**
     * 项目概览：目录数、API 数、环境数、默认环境。
     */
    public ApiStudioProjectOverview getOverview(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        List<ApiStudioDirectoryEntity> directories = directoryRepository.findByProjectIdOrderByParentIdAscSortOrderAscIdAsc(projectId);
        List<ApiStudioEndpointEntity> endpoints = endpointRepository.findByProjectIdOrderBySortOrderAscIdAsc(projectId);
        var defaultEnv = environmentRepository.findFirstByProjectIdAndIsDefaultTrue(projectId).orElse(null);
        int envCount = environmentRepository.findByProjectIdOrderByIsDefaultDescIdAsc(projectId).size();
        return new ApiStudioProjectOverview(
                project.getId(),
                project.getName(),
                directories.size(),
                endpoints.size(),
                envCount,
                defaultEnv == null ? null : defaultEnv.getId(),
                defaultEnv == null ? null : defaultEnv.getName()
        );
    }

    // ========== 目录树 ==========

    /**
     * 加载整个项目的目录 + API 树。
     */
    public ApiStudioProjectTree loadTree(Long projectId) {
        requireVisibleProject(projectId);
        List<ApiStudioDirectoryEntity> directories = directoryRepository.findByProjectIdOrderByParentIdAscSortOrderAscIdAsc(projectId);
        List<ApiStudioEndpointEntity> endpoints = endpointRepository.findByProjectIdOrderBySortOrderAscIdAsc(projectId);

        // 按 parentId 分组目录
        Map<Long, List<ApiStudioDirectoryEntity>> dirByParent = new HashMap<>();
        for (ApiStudioDirectoryEntity dir : directories) {
            dirByParent.computeIfAbsent(dir.getParentId(), k -> new ArrayList<>()).add(dir);
        }
        // 按 directoryId 分组 API
        Map<Long, List<ApiStudioEndpointEntity>> epByDir = new HashMap<>();
        for (ApiStudioEndpointEntity ep : endpoints) {
            epByDir.computeIfAbsent(ep.getDirectoryId(), k -> new ArrayList<>()).add(ep);
        }

        List<ApiStudioTreeNode> rootNodes = buildChildren(null, dirByParent, epByDir);
        List<ApiStudioEndpointSummary> rootEndpoints = (epByDir.get(null) == null ? new ArrayList<ApiStudioEndpointEntity>() : epByDir.get(null))
                .stream().map(this::toEndpointSummary).toList();
        return new ApiStudioProjectTree(projectId, rootNodes, rootEndpoints);
    }

    private List<ApiStudioTreeNode> buildChildren(Long parentId,
                                                  Map<Long, List<ApiStudioDirectoryEntity>> dirByParent,
                                                  Map<Long, List<ApiStudioEndpointEntity>> epByDir) {
        List<ApiStudioDirectoryEntity> children = dirByParent.getOrDefault(parentId, List.of());
        List<ApiStudioTreeNode> result = new ArrayList<>(children.size());
        for (ApiStudioDirectoryEntity dir : children) {
            List<ApiStudioTreeNode> sub = buildChildren(dir.getId(), dirByParent, epByDir);
            List<ApiStudioEndpointSummary> dirEndpoints = epByDir.getOrDefault(dir.getId(), List.of())
                    .stream().map(this::toEndpointSummary).toList();
            result.add(new ApiStudioTreeNode(toDirSummary(dir), sub, dirEndpoints));
        }
        return result;
    }

    // ========== 目录 CRUD ==========

    @Transactional
    public ApiStudioDirectorySummary createDirectory(Long projectId, ApiStudioDirectoryRequest request) {
        requireEditableProject(projectId);
        Long userId = currentUserId();
        ApiStudioDirectoryEntity entity = new ApiStudioDirectoryEntity();
        entity.setProjectId(projectId);
        entity.setParentId(validatedParent(projectId, request.parentId()));
        entity.setName(request.name());
        entity.setDescription(request.description());
        entity.setSortOrder(request.sortOrder() == null ? nextSortOrder(projectId, entity.getParentId()) : request.sortOrder());
        entity.setCreatedBy(userId);
        entity.setUpdatedBy(userId);
        return toDirSummary(directoryRepository.save(entity));
    }

    @Transactional
    public ApiStudioDirectorySummary updateDirectory(Long projectId, Long directoryId, ApiStudioDirectoryRequest request) {
        requireEditableProject(projectId);
        ApiStudioDirectoryEntity entity = directoryRepository.findById(directoryId)
                .orElseThrow(() -> new NoSuchElementException("目录不存在: " + directoryId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("目录不属于当前项目");
        }
        Long newParentId = validatedParent(projectId, request.parentId());
        if (newParentId != null && wouldCreateCycle(directoryId, newParentId)) {
            throw new IllegalArgumentException("不能将目录移动到其自身或后代目录下");
        }
        entity.setParentId(newParentId);
        entity.setName(request.name());
        entity.setDescription(request.description());
        if (request.sortOrder() != null) {
            entity.setSortOrder(request.sortOrder());
        }
        entity.setUpdatedBy(currentUserId());
        entity.setUpdatedAt(LocalDateTime.now());
        return toDirSummary(directoryRepository.save(entity));
    }

    @Transactional
    public void deleteDirectory(Long projectId, Long directoryId) {
        requireEditableProject(projectId);
        ApiStudioDirectoryEntity entity = directoryRepository.findById(directoryId)
                .orElseThrow(() -> new NoSuchElementException("目录不存在: " + directoryId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("目录不属于当前项目");
        }
        long childDirs = directoryRepository.countByParentId(directoryId);
        long childEndpoints = endpointRepository.countByDirectoryId(directoryId);
        if (childDirs > 0 || childEndpoints > 0) {
            throw new IllegalArgumentException("目录非空，无法删除（请先清空子目录与 API）");
        }
        directoryRepository.delete(entity);
    }

    @Transactional
    public void reorderDirectories(Long projectId, ApiStudioDirectoryReorderRequest request) {
        requireEditableProject(projectId);
        if (request == null || request.items() == null) return;
        for (ApiStudioDirectoryReorderRequest.Item item : request.items()) {
            ApiStudioDirectoryEntity entity = directoryRepository.findById(item.directoryId())
                    .orElseThrow(() -> new NoSuchElementException("目录不存在: " + item.directoryId()));
            if (!Objects.equals(entity.getProjectId(), projectId)) {
                throw new ForbiddenException("目录不属于当前项目: " + item.directoryId());
            }
            Long parent = validatedParent(projectId, item.parentId());
            if (parent != null && wouldCreateCycle(item.directoryId(), parent)) {
                throw new IllegalArgumentException("不能将目录移动到其自身或后代目录下: " + item.directoryId());
            }
            entity.setParentId(parent);
            entity.setSortOrder(item.sortOrder() == null ? 0 : item.sortOrder());
            entity.setUpdatedBy(currentUserId());
            entity.setUpdatedAt(LocalDateTime.now());
            directoryRepository.save(entity);
        }
    }

    // ========== 辅助 ==========

    private Long validatedParent(Long projectId, Long parentId) {
        if (parentId == null) return null;
        ApiStudioDirectoryEntity parent = directoryRepository.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("父目录不存在: " + parentId));
        if (!Objects.equals(parent.getProjectId(), projectId)) {
            throw new IllegalArgumentException("父目录不属于当前项目");
        }
        return parentId;
    }

    private boolean wouldCreateCycle(Long directoryId, Long targetParentId) {
        Long current = targetParentId;
        int safety = 0;
        while (current != null && safety++ < 64) {
            if (Objects.equals(current, directoryId)) return true;
            ApiStudioDirectoryEntity parent = directoryRepository.findById(current).orElse(null);
            if (parent == null) return false;
            current = parent.getParentId();
        }
        return false;
    }

    private int nextSortOrder(Long projectId, Long parentId) {
        return directoryRepository.findByProjectIdAndParentIdOrderBySortOrderAscIdAsc(projectId, parentId).size();
    }

    private Long currentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElse(null);
    }

    private ApiStudioDirectorySummary toDirSummary(ApiStudioDirectoryEntity e) {
        return new ApiStudioDirectorySummary(
                e.getId(), e.getProjectId(), e.getParentId(), e.getName(), e.getDescription(),
                e.getSortOrder(), e.getCreatedBy(), e.getUpdatedBy(), e.getCreatedAt(), e.getUpdatedAt()
        );
    }

    private ApiStudioEndpointSummary toEndpointSummary(ApiStudioEndpointEntity e) {
        return new ApiStudioEndpointSummary(
                e.getId(), e.getProjectId(), e.getDirectoryId(), e.getName(),
                e.getMethod(), e.getPath(), e.getSummary(), e.getStatus(),
                e.getSortOrder(), e.getRevision(), e.getUpdatedAt()
        );
    }
}
