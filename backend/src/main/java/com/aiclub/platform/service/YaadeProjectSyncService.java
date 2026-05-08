package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformYaadeProjectBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.repository.PlatformYaadeProjectBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * 项目与 Yaade collection 的绑定同步服务。
 */
@Service
@Transactional(readOnly = true)
public class YaadeProjectSyncService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    private final ProjectRepository projectRepository;
    private final PlatformYaadeProjectBindingRepository projectBindingRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final YaadeClientService yaadeClientService;
    private final YaadeProperties yaadeProperties;
    private final ObjectMapper objectMapper;

    public YaadeProjectSyncService(ProjectRepository projectRepository,
                                   PlatformYaadeProjectBindingRepository projectBindingRepository,
                                   ProjectDataPermissionService projectDataPermissionService,
                                   YaadeClientService yaadeClientService,
                                   YaadeProperties yaadeProperties,
                                   ObjectMapper objectMapper) {
        this.projectRepository = projectRepository;
        this.projectBindingRepository = projectBindingRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.yaadeClientService = yaadeClientService;
        this.yaadeProperties = yaadeProperties;
        this.objectMapper = objectMapper;
    }

    public ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    public ProjectEntity requireEditableProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectEditable(project);
        return project;
    }

    public List<PlatformYaadeProjectBindingEntity> listActiveBindings() {
        return projectBindingRepository.findAllByStatusOrderByProjectIdAsc(STATUS_ACTIVE);
    }

    public PlatformYaadeProjectBindingEntity findBindingByProjectId(Long projectId) {
        return projectBindingRepository.findByProjectId(projectId).orElse(null);
    }

    @Transactional
    public EnsureProjectBindingResult ensurePublicCollection() {
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        List<YaadeClientService.YaadeRemoteCollection> collections = yaadeClientService.listCollections(adminSession);
        YaadeClientService.YaadeRemoteCollection matched = collections.stream()
                .filter(collection -> collection.parentId() == null)
                .filter(collection -> collection.groups().contains(yaadeProperties.getPublicGroupName()))
                .findFirst()
                .orElse(null);
        boolean created = false;
        if (matched == null) {
            matched = yaadeClientService.createCollection(
                    adminSession,
                    yaadeProperties.getPublicCollectionName(),
                    List.of(yaadeProperties.getPublicGroupName())
            );
            created = true;
        } else if (!matched.groups().equals(List.of(yaadeProperties.getPublicGroupName()))) {
            matched = yaadeClientService.updateCollection(
                    adminSession,
                    matched.withNameAndGroups(
                            objectMapper,
                            yaadeProperties.getPublicCollectionName(),
                            List.of(yaadeProperties.getPublicGroupName())
                    )
            );
        }
        return new EnsureProjectBindingResult(
                toPublicSummary(matched),
                created
        );
    }

    @Transactional
    public EnsureProjectBindingResult ensureProjectBinding(ProjectEntity project) {
        projectDataPermissionService.requireProjectVisible(project);
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        PlatformYaadeProjectBindingEntity binding = projectBindingRepository.findByProjectId(project.getId()).orElse(null);
        String expectedGroupName = yaadeProperties.projectGroupName(project.getId());
        boolean created = false;
        YaadeClientService.YaadeRemoteCollection collection = null;
        if (binding != null) {
            try {
                collection = yaadeClientService.findCollectionById(adminSession, binding.getYaadeCollectionId());
            } catch (NoSuchElementException ignored) {
                collection = null;
            }
        }
        if (collection == null) {
            collection = yaadeClientService.listCollections(adminSession).stream()
                    .filter(item -> item.parentId() == null)
                    .filter(item -> item.groups().contains(expectedGroupName))
                    .findFirst()
                    .orElse(null);
        }
        if (collection == null) {
            collection = yaadeClientService.createCollection(adminSession, project.getName(), List.of(expectedGroupName));
            created = true;
        } else if (!Objects.equals(collection.name(), project.getName())
                || !collection.groups().equals(List.of(expectedGroupName))) {
            collection = yaadeClientService.updateCollection(
                    adminSession,
                    collection.withNameAndGroups(objectMapper, project.getName(), List.of(expectedGroupName))
            );
        }

        PlatformYaadeProjectBindingEntity entity = binding == null ? new PlatformYaadeProjectBindingEntity() : binding;
        entity.setProjectId(project.getId());
        entity.setYaadeCollectionId(collection.id());
        entity.setYaadeGroupName(expectedGroupName);
        entity.setStatus(STATUS_ACTIVE);
        entity.setArchivedName(null);
        entity.setLastSyncedAt(LocalDateTime.now());
        PlatformYaadeProjectBindingEntity saved = projectBindingRepository.save(entity);
        return new EnsureProjectBindingResult(toSummary(saved, collection.name()), created || binding == null);
    }

    @Transactional
    public void syncProjectRename(ProjectEntity project) {
        PlatformYaadeProjectBindingEntity binding = projectBindingRepository.findByProjectId(project.getId()).orElse(null);
        if (binding == null || !STATUS_ACTIVE.equalsIgnoreCase(binding.getStatus())) {
            return;
        }
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        YaadeClientService.YaadeRemoteCollection collection = yaadeClientService.findCollectionById(adminSession, binding.getYaadeCollectionId());
        YaadeClientService.YaadeRemoteCollection updated = collection.withNameAndGroups(
                objectMapper,
                project.getName(),
                List.of(binding.getYaadeGroupName())
        );
        yaadeClientService.updateCollection(adminSession, updated);
        binding.setLastSyncedAt(LocalDateTime.now());
        binding.setArchivedName(null);
        projectBindingRepository.save(binding);
    }

    @Transactional
    public void archiveProjectBinding(Long projectId, String projectName) {
        PlatformYaadeProjectBindingEntity binding = projectBindingRepository.findByProjectId(projectId).orElse(null);
        if (binding == null) {
            return;
        }
        String archivedName = "已归档-" + projectId + "-" + projectName;
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        try {
            YaadeClientService.YaadeRemoteCollection collection = yaadeClientService.findCollectionById(adminSession, binding.getYaadeCollectionId());
            yaadeClientService.updateCollection(
                    adminSession,
                    collection.withNameAndGroups(objectMapper, archivedName, List.of("admin"))
            );
        } catch (NoSuchElementException ignored) {
            // 远端 collection 已不存在时，平台仍把绑定标记成已归档，避免项目删除链路被 Yaade 卡住。
        }
        binding.setStatus(STATUS_ARCHIVED);
        binding.setArchivedName(archivedName);
        binding.setLastSyncedAt(LocalDateTime.now());
        projectBindingRepository.save(binding);
    }

    public YaadeProjectBindingSummary getBindingSummary(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        PlatformYaadeProjectBindingEntity binding = projectBindingRepository.findByProjectId(projectId).orElse(null);
        if (binding == null) {
            return new YaadeProjectBindingSummary(
                    project.getId(),
                    false,
                    false,
                    null,
                    yaadeProperties.projectGroupName(projectId),
                    STATUS_ACTIVE,
                    project.getName(),
                    null,
                    null
            );
        }
        return toSummary(binding, project.getName());
    }

    private YaadeProjectBindingSummary toSummary(PlatformYaadeProjectBindingEntity binding, String collectionName) {
        return new YaadeProjectBindingSummary(
                binding.getProjectId(),
                false,
                true,
                binding.getYaadeCollectionId(),
                binding.getYaadeGroupName(),
                binding.getStatus(),
                collectionName,
                binding.getArchivedName(),
                binding.getLastSyncedAt() == null ? null : binding.getLastSyncedAt().format(TIME_FORMATTER)
        );
    }

    private YaadeProjectBindingSummary toPublicSummary(YaadeClientService.YaadeRemoteCollection collection) {
        return new YaadeProjectBindingSummary(
                null,
                true,
                true,
                collection.id(),
                yaadeProperties.getPublicGroupName(),
                STATUS_ACTIVE,
                collection.name(),
                null,
                null
        );
    }

    public record EnsureProjectBindingResult(
            YaadeProjectBindingSummary summary,
            boolean created
    ) {
    }
}
