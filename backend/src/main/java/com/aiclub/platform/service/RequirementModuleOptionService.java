package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectRequirementModuleOptionEntity;
import com.aiclub.platform.dto.ProjectRequirementModuleOptionSummary;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.ProjectRequirementModuleOptionRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/**
 * 管理项目级需求模块候选项。
 * 候选项只服务下拉选择，不反向改写已经保存的需求所属模块。
 */
@Service
@Transactional(readOnly = true)
public class RequirementModuleOptionService {

    private static final String REQUIREMENT_WORK_ITEM_TYPE = "需求";
    private static final String DEFAULT_REQUIREMENT_MODULE_NAME = "未分类";

    private final ProjectRequirementModuleOptionRepository optionRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;

    public RequirementModuleOptionService(ProjectRequirementModuleOptionRepository optionRepository,
                                          ProjectRepository projectRepository,
                                          ProjectDataPermissionService projectDataPermissionService) {
        this.optionRepository = optionRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    /**
     * 按项目读取可复用的需求模块候选项。
     */
    public List<ProjectRequirementModuleOptionSummary> listProjectRequirementModules(Long projectId) {
        requireProject(projectId);
        return optionRepository.findAllByProject_IdOrderByModuleNameAscIdAsc(projectId).stream()
                .map(this::toSummary)
                .toList();
    }

    /**
     * 删除项目级候选项；历史需求的 moduleName 保持不变。
     */
    @Transactional
    public void deleteProjectRequirementModule(Long projectId, Long optionId) {
        requireProject(projectId);
        ProjectRequirementModuleOptionEntity option = optionRepository.findByIdAndProject_Id(optionId, projectId)
                .orElseThrow(() -> new NoSuchElementException("需求模块候选不存在: " + optionId));
        optionRepository.delete(option);
    }

    /**
     * 在需求保存时按需补录自定义模块候选。
     */
    @Transactional
    public void ensureCustomRequirementModule(ProjectEntity project, String workItemType, String moduleName) {
        String normalizedModuleName = normalizePersistableModuleName(workItemType, moduleName);
        if (project == null || normalizedModuleName == null) {
            return;
        }
        Long projectId = project.getId();
        if (optionRepository.existsByProject_IdAndModuleName(projectId, normalizedModuleName)) {
            return;
        }
        ProjectRequirementModuleOptionEntity option = new ProjectRequirementModuleOptionEntity();
        option.setProject(project);
        option.setModuleName(normalizedModuleName);
        try {
            optionRepository.saveAndFlush(option);
        } catch (DataIntegrityViolationException ignored) {
            // 并发保存相同模块时由唯一约束兜底，已有候选即可满足下拉复用。
        }
    }

    private ProjectEntity requireProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private ProjectRequirementModuleOptionSummary toSummary(ProjectRequirementModuleOptionEntity entity) {
        return new ProjectRequirementModuleOptionSummary(entity.getId(), entity.getModuleName());
    }

    private String normalizePersistableModuleName(String workItemType, String moduleName) {
        if (!REQUIREMENT_WORK_ITEM_TYPE.equals(defaultString(workItemType).trim())) {
            return null;
        }
        String normalized = defaultString(moduleName).trim();
        if (normalized.isBlank() || DEFAULT_REQUIREMENT_MODULE_NAME.equals(normalized)) {
            return null;
        }
        return normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
