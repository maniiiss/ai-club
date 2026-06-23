package com.aiclub.platform.service.apistudio;

import com.aiclub.platform.domain.model.ApiStudioEnvironmentEntity;
import com.aiclub.platform.domain.model.ApiStudioEnvironmentVariableEntity;
import com.aiclub.platform.dto.apistudio.ApiStudioEnvironmentDetail;
import com.aiclub.platform.dto.apistudio.ApiStudioEnvironmentVariableItem;
import com.aiclub.platform.dto.request.apistudio.ApiStudioEnvironmentRequest;
import com.aiclub.platform.dto.request.apistudio.ApiStudioVariablePayload;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ApiStudioEnvironmentRepository;
import com.aiclub.platform.repository.ApiStudioEnvironmentVariableRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 原生 API 工作台 - 环境与变量服务。
 * 负责：环境 CRUD、变量管理、默认环境维护、变量值脱敏。
 * 同一项目只允许有一个默认环境。
 * secret=true 的变量在 DTO 返回时显示掩码；编辑只允许覆盖或清空。
 */
@Service
public class ApiStudioEnvironmentService {

    private static final Set<String> ALLOWED_AUTH = Set.of("NONE", "BEARER", "API_KEY");
    private static final String MASK = "***";

    private final ApiStudioEnvironmentRepository environmentRepository;
    private final ApiStudioEnvironmentVariableRepository variableRepository;
    private final ApiStudioDirectoryService directoryService;

    public ApiStudioEnvironmentService(ApiStudioEnvironmentRepository environmentRepository,
                                       ApiStudioEnvironmentVariableRepository variableRepository,
                                       ApiStudioDirectoryService directoryService) {
        this.environmentRepository = environmentRepository;
        this.variableRepository = variableRepository;
        this.directoryService = directoryService;
    }

    public List<ApiStudioEnvironmentDetail> list(Long projectId) {
        directoryService.requireVisibleProject(projectId);
        return environmentRepository.findByProjectIdOrderByIsDefaultDescIdAsc(projectId)
                .stream().map(this::toDetail).toList();
    }

    public ApiStudioEnvironmentDetail get(Long projectId, Long environmentId) {
        directoryService.requireVisibleProject(projectId);
        ApiStudioEnvironmentEntity entity = loadAndValidate(projectId, environmentId);
        return toDetail(entity);
    }

    @Transactional
    public ApiStudioEnvironmentDetail create(Long projectId, ApiStudioEnvironmentRequest request) {
        directoryService.requireEditableProject(projectId);
        validate(request);
        Long userId = currentUserId();
        ApiStudioEnvironmentEntity entity = new ApiStudioEnvironmentEntity();
        entity.setProjectId(projectId);
        entity.setName(request.name());
        entity.setBaseUrl(request.baseUrl());
        entity.setCommonHeadersJson(request.commonHeadersJson());
        entity.setAuthType(request.authType() == null ? "NONE" : request.authType().toUpperCase());
        entity.setAuthConfigJson(request.authConfigJson());
        entity.setIsDefault(Boolean.TRUE.equals(request.isDefault()));
        entity.setCreatedBy(userId);
        entity.setUpdatedBy(userId);
        ApiStudioEnvironmentEntity saved = environmentRepository.save(entity);

        if (saved.getIsDefault()) {
            enforceSingleDefault(projectId, saved.getId());
        }
        applyVariables(saved.getId(), request.variables(), Map.of());
        return toDetail(saved);
    }

    @Transactional
    public ApiStudioEnvironmentDetail update(Long projectId, Long environmentId, ApiStudioEnvironmentRequest request) {
        directoryService.requireEditableProject(projectId);
        validate(request);
        ApiStudioEnvironmentEntity entity = loadAndValidate(projectId, environmentId);
        entity.setName(request.name());
        entity.setBaseUrl(request.baseUrl());
        entity.setCommonHeadersJson(request.commonHeadersJson());
        entity.setAuthType(request.authType() == null ? "NONE" : request.authType().toUpperCase());
        entity.setAuthConfigJson(request.authConfigJson());
        if (request.isDefault() != null) {
            entity.setIsDefault(request.isDefault());
        }
        entity.setUpdatedBy(currentUserId());
        entity.setUpdatedAt(LocalDateTime.now());
        environmentRepository.save(entity);
        if (entity.getIsDefault()) {
            enforceSingleDefault(projectId, environmentId);
        }
        // 现有变量映射：name -> 原密文（用于 secret 时若 value=null/MASK 则保留旧值）
        Map<String, String> oldByName = new HashMap<>();
        for (ApiStudioEnvironmentVariableEntity v : variableRepository.findByEnvironmentIdOrderByIdAsc(environmentId)) {
            oldByName.put(v.getName(), v.getValueCiphertext());
        }
        variableRepository.deleteByEnvironmentId(environmentId);
        applyVariables(environmentId, request.variables(), oldByName);
        return toDetail(environmentRepository.findById(environmentId).orElseThrow());
    }

    @Transactional
    public void delete(Long projectId, Long environmentId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEnvironmentEntity entity = loadAndValidate(projectId, environmentId);
        environmentRepository.delete(entity);
    }

    @Transactional
    public ApiStudioEnvironmentDetail setDefault(Long projectId, Long environmentId) {
        directoryService.requireEditableProject(projectId);
        ApiStudioEnvironmentEntity entity = loadAndValidate(projectId, environmentId);
        entity.setIsDefault(true);
        environmentRepository.save(entity);
        enforceSingleDefault(projectId, environmentId);
        return toDetail(environmentRepository.findById(environmentId).orElseThrow());
    }

    /**
     * 加载实体（供调试代理服务使用）；不做权限二次校验，调用方需自行校验项目可见性。
     */
    public ApiStudioEnvironmentEntity loadEntity(Long projectId, Long environmentId) {
        return loadAndValidate(projectId, environmentId);
    }

    /**
     * 加载某环境的所有变量原始密文/明文，调试代理在解析时使用。
     */
    public List<ApiStudioEnvironmentVariableEntity> loadVariables(Long environmentId) {
        return variableRepository.findByEnvironmentIdOrderByIdAsc(environmentId);
    }

    // ========== 内部 ==========

    private ApiStudioEnvironmentEntity loadAndValidate(Long projectId, Long environmentId) {
        ApiStudioEnvironmentEntity entity = environmentRepository.findById(environmentId)
                .orElseThrow(() -> new NoSuchElementException("环境不存在: " + environmentId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("环境不属于当前项目");
        }
        return entity;
    }

    private void validate(ApiStudioEnvironmentRequest req) {
        if (req.baseUrl() == null || req.baseUrl().isBlank()) {
            throw new IllegalArgumentException("baseUrl 不能为空");
        }
        if (req.authType() != null && !ALLOWED_AUTH.contains(req.authType().toUpperCase())) {
            throw new IllegalArgumentException("不支持的认证类型: " + req.authType());
        }
        // 简单 URL 校验
        String url = req.baseUrl().trim();
        if (!(url.startsWith("http://") || url.startsWith("https://"))) {
            throw new IllegalArgumentException("baseUrl 必须以 http:// 或 https:// 开头");
        }
    }

    private void enforceSingleDefault(Long projectId, Long keepId) {
        for (ApiStudioEnvironmentEntity other : environmentRepository.findByProjectIdAndIsDefaultTrue(projectId)) {
            if (!Objects.equals(other.getId(), keepId)) {
                other.setIsDefault(false);
                other.setUpdatedAt(LocalDateTime.now());
                environmentRepository.save(other);
            }
        }
    }

    private void applyVariables(Long environmentId, List<ApiStudioVariablePayload> variables, Map<String, String> oldByName) {
        if (variables == null) return;
        for (ApiStudioVariablePayload p : variables) {
            if (p.name() == null || p.name().isBlank()) continue;
            if (Objects.equals(p.name(), "baseUrl")) {
                // baseUrl 为内置变量，不允许覆盖
                continue;
            }
            ApiStudioEnvironmentVariableEntity ent = new ApiStudioEnvironmentVariableEntity();
            ent.setEnvironmentId(environmentId);
            ent.setName(p.name());
            ent.setSecret(Boolean.TRUE.equals(p.secret()));
            ent.setDescription(p.description());
            String value = p.value();
            if (Boolean.TRUE.equals(p.secret()) && (value == null || MASK.equals(value))) {
                // 未修改 secret 值，保留旧密文
                value = oldByName.get(p.name());
            }
            ent.setValueCiphertext(value);
            variableRepository.save(ent);
        }
    }

    private ApiStudioEnvironmentDetail toDetail(ApiStudioEnvironmentEntity entity) {
        List<ApiStudioEnvironmentVariableItem> vars = variableRepository
                .findByEnvironmentIdOrderByIdAsc(entity.getId())
                .stream().map(v -> new ApiStudioEnvironmentVariableItem(
                        v.getId(), v.getName(),
                        Boolean.TRUE.equals(v.getSecret()) ? (v.getValueCiphertext() == null ? null : MASK) : v.getValueCiphertext(),
                        v.getSecret(), v.getDescription()))
                .toList();
        return new ApiStudioEnvironmentDetail(
                entity.getId(), entity.getProjectId(), entity.getName(),
                entity.getBaseUrl(), entity.getCommonHeadersJson(),
                entity.getAuthType(), entity.getAuthConfigJson(),
                entity.getIsDefault(), entity.getCreatedAt(), entity.getUpdatedAt(), vars);
    }

    private Long currentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElse(null);
    }
}
