package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformToolConfigEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolSummary;
import com.aiclub.platform.dto.request.PlatformToolConfigRequest;
import com.aiclub.platform.repository.PlatformToolConfigRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 平台工具管理服务。
 * 第一版只允许修改工具覆盖配置，不允许通过后台创建新的工具实现。
 */
@Service
@Transactional(readOnly = true)
public class PlatformToolManagementService {

    private final PlatformToolRegistry platformToolRegistry;
    private final PlatformToolConfigRepository platformToolConfigRepository;

    public PlatformToolManagementService(PlatformToolRegistry platformToolRegistry,
                                         PlatformToolConfigRepository platformToolConfigRepository) {
        this.platformToolRegistry = platformToolRegistry;
        this.platformToolConfigRepository = platformToolConfigRepository;
    }

    /**
     * 分页查询平台工具。
     */
    public PageResponse<PlatformToolSummary> pageTools(int page,
                                                       int size,
                                                       String keyword,
                                                       String moduleCode,
                                                       Boolean enabled,
                                                       Boolean readOnly) {
        List<PlatformToolSummary> allTools = platformToolRegistry.listDefinitions().stream()
                .map(this::toSummary)
                .filter(item -> matchesKeyword(item, keyword))
                .filter(item -> matchesModule(item, moduleCode))
                .filter(item -> enabled == null || item.enabled() == enabled)
                .filter(item -> readOnly == null || item.readOnly() == readOnly)
                .toList();

        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        int fromIndex = Math.min((safePage - 1) * safeSize, allTools.size());
        int toIndex = Math.min(fromIndex + safeSize, allTools.size());
        int totalPages = allTools.isEmpty() ? 1 : (int) Math.ceil((double) allTools.size() / safeSize);
        return new PageResponse<>(allTools.subList(fromIndex, toIndex), allTools.size(), safePage, safeSize, totalPages);
    }

    /**
     * 读取单个工具详情。
     */
    public PlatformToolSummary getTool(String toolCode) {
        return toSummary(platformToolRegistry.requireDefinition(toolCode));
    }

    /**
     * 更新工具覆盖配置。
     */
    @Transactional
    public PlatformToolSummary updateTool(String toolCode, PlatformToolConfigRequest request) {
        PlatformToolDefinition definition = platformToolRegistry.requireDefinition(toolCode);
        PlatformToolConfigEntity entity = platformToolConfigRepository.findByToolCode(toolCode)
                .orElseGet(() -> {
                    PlatformToolConfigEntity created = new PlatformToolConfigEntity();
                    created.setToolCode(toolCode);
                    return created;
                });
        entity.setDisplayName(defaultString(request.displayName()));
        entity.setDescriptionOverride(defaultString(request.descriptionOverride()));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
        entity.setAllowAutoExecute(Boolean.TRUE.equals(request.allowAutoExecute()) && definition.readOnly());
        platformToolConfigRepository.save(entity);
        return toSummary(platformToolRegistry.requireDefinition(toolCode));
    }

    private PlatformToolSummary toSummary(PlatformToolDefinition definition) {
        PlatformToolConfigEntity config = platformToolConfigRepository.findByToolCode(definition.code()).orElse(null);
        return new PlatformToolSummary(
                definition.code(),
                definition.name(),
                definition.moduleCode(),
                definition.description(),
                definition.readOnly(),
                definition.riskLevel(),
                definition.permissionCode(),
                definition.requiresConfirm(),
                config == null || config.isEnabled(),
                config != null && config.isAllowAutoExecute() && definition.readOnly(),
                config == null ? "" : defaultString(config.getDisplayName()),
                config == null ? "" : defaultString(config.getDescriptionOverride())
        );
    }

    private boolean matchesKeyword(PlatformToolSummary item, String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        String pattern = keyword.trim().toLowerCase(Locale.ROOT);
        return defaultString(item.code()).toLowerCase(Locale.ROOT).contains(pattern)
                || defaultString(item.name()).toLowerCase(Locale.ROOT).contains(pattern)
                || defaultString(item.description()).toLowerCase(Locale.ROOT).contains(pattern)
                || defaultString(item.permissionCode()).toLowerCase(Locale.ROOT).contains(pattern);
    }

    private boolean matchesModule(PlatformToolSummary item, String moduleCode) {
        if (moduleCode == null || moduleCode.isBlank()) {
            return true;
        }
        return defaultString(item.moduleCode()).equalsIgnoreCase(moduleCode.trim());
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
