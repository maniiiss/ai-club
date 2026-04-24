package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.SelfUpgradeCenterConfigEntity;
import com.aiclub.platform.domain.model.SelfUpgradeEnvironmentProfileEntity;
import com.aiclub.platform.dto.SelfUpgradeCenterConfigSummary;
import com.aiclub.platform.dto.SelfUpgradeEnvironmentProfileSummary;
import com.aiclub.platform.dto.request.SelfUpgradeCenterConfigRequest;
import com.aiclub.platform.dto.request.SelfUpgradeEnvironmentProfileRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.SelfUpgradeCenterConfigRepository;
import com.aiclub.platform.repository.SelfUpgradeEnvironmentProfileRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * 自升级中心配置服务。
 * 负责维护单例中心配置和环境档案，不把平台公共项目/Agent 配置强耦合进 controller。
 */
@Service
@Transactional(readOnly = true)
public class SelfUpgradeConfigService {

    public static final String BOT_USERNAME = "self-upgrade-bot";

    private final SelfUpgradeCenterConfigRepository centerConfigRepository;
    private final SelfUpgradeEnvironmentProfileRepository environmentProfileRepository;
    private final ProjectRepository projectRepository;
    private final AgentRepository agentRepository;
    private final TokenCipherService tokenCipherService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public SelfUpgradeConfigService(SelfUpgradeCenterConfigRepository centerConfigRepository,
                                    SelfUpgradeEnvironmentProfileRepository environmentProfileRepository,
                                    ProjectRepository projectRepository,
                                    AgentRepository agentRepository,
                                    TokenCipherService tokenCipherService,
                                    UserRepository userRepository,
                                    ObjectMapper objectMapper) {
        this.centerConfigRepository = centerConfigRepository;
        this.environmentProfileRepository = environmentProfileRepository;
        this.projectRepository = projectRepository;
        this.agentRepository = agentRepository;
        this.tokenCipherService = tokenCipherService;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    public SelfUpgradeCenterConfigSummary getConfig() {
        return toConfigSummary(requireCenterConfig());
    }

    /**
     * 统一更新单例配置和环境档案。
     * v1 主要面向中心配置抽屉使用，因此把两类配置一起收口，避免前端反复切多个保存入口。
     */
    @Transactional
    public SelfUpgradeCenterConfigSummary updateConfig(SelfUpgradeCenterConfigRequest request) {
        SelfUpgradeCenterConfigEntity config = requireCenterConfig();
        if (request.environmentProfiles() != null) {
            syncEnvironmentProfiles(request.environmentProfiles());
        }

        config.setDefaultEnvironmentProfile(request.defaultEnvironmentProfileId() == null
                ? null
                : requireEnvironmentProfile(request.defaultEnvironmentProfileId()));
        config.setCarrierProject(request.carrierProjectId() == null
                ? null
                : requireProject(request.carrierProjectId()));
        config.setDefaultRepositoryBindingIdsJson(normalizeJsonArray(request.defaultRepositoryBindingIdsJson()));
        config.setDevelopmentPlanAgent(request.developmentPlanAgentId() == null ? null : requireAgent(request.developmentPlanAgentId()));
        config.setDevelopmentImplementAgent(request.developmentImplementAgentId() == null ? null : requireAgent(request.developmentImplementAgentId()));
        config.setDevelopmentTestAgent(request.developmentTestAgentId() == null ? null : requireAgent(request.developmentTestAgentId()));
        config.setDevelopmentReportAgent(request.developmentReportAgentId() == null ? null : requireAgent(request.developmentReportAgentId()));
        return toConfigSummary(centerConfigRepository.save(config));
    }

    public SelfUpgradeCenterConfigEntity requireCenterConfig() {
        return centerConfigRepository.findFirstByOrderByIdAsc()
                .orElseThrow(() -> new NoSuchElementException("自升级中心配置不存在"));
    }

    public SelfUpgradeEnvironmentProfileEntity requireEnvironmentProfile(Long id) {
        return environmentProfileRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("自升级环境档案不存在: " + id));
    }

    public com.aiclub.platform.domain.model.UserEntity requireSelfUpgradeBot() {
        return userRepository.findByUsernameWithDetails(BOT_USERNAME)
                .orElseThrow(() -> new NoSuchElementException("self-upgrade-bot 不存在，请先执行数据库迁移"));
    }

    public SelfUpgradeCenterConfigSummary toConfigSummary(SelfUpgradeCenterConfigEntity config) {
        List<SelfUpgradeEnvironmentProfileSummary> environmentProfiles = environmentProfileRepository.findAllByOrderByIdAsc().stream()
                .map(this::toEnvironmentProfileSummary)
                .toList();
        return new SelfUpgradeCenterConfigSummary(
                config.getId(),
                config.getDefaultEnvironmentProfile() == null ? null : config.getDefaultEnvironmentProfile().getId(),
                config.getCarrierProject() == null ? null : config.getCarrierProject().getId(),
                defaultString(config.getDefaultRepositoryBindingIdsJson()),
                config.getDevelopmentPlanAgent() == null ? null : config.getDevelopmentPlanAgent().getId(),
                config.getDevelopmentImplementAgent() == null ? null : config.getDevelopmentImplementAgent().getId(),
                config.getDevelopmentTestAgent() == null ? null : config.getDevelopmentTestAgent().getId(),
                config.getDevelopmentReportAgent() == null ? null : config.getDevelopmentReportAgent().getId(),
                environmentProfiles
        );
    }

    public SelfUpgradeEnvironmentProfileSummary toEnvironmentProfileSummary(SelfUpgradeEnvironmentProfileEntity environmentProfile) {
        return new SelfUpgradeEnvironmentProfileSummary(
                environmentProfile.getId(),
                environmentProfile.getCode(),
                environmentProfile.getName(),
                environmentProfile.getBaseUrl(),
                defaultString(environmentProfile.getAllowedHostPatternsJson()),
                defaultString(environmentProfile.getLoginScriptJson()),
                defaultString(environmentProfile.getSandboxUsername()),
                hasText(environmentProfile.getSandboxPasswordCiphertext()),
                hasText(environmentProfile.getSessionStateCiphertext()),
                defaultString(environmentProfile.getWriteAllowlistJson()),
                environmentProfile.isEnabled()
        );
    }

    private void syncEnvironmentProfiles(List<SelfUpgradeEnvironmentProfileRequest> requests) {
        LinkedHashMap<Long, SelfUpgradeEnvironmentProfileEntity> existing = new LinkedHashMap<>();
        environmentProfileRepository.findAllByOrderByIdAsc().forEach(item -> existing.put(item.getId(), item));
        List<SelfUpgradeEnvironmentProfileEntity> toSave = new ArrayList<>();
        for (SelfUpgradeEnvironmentProfileRequest request : requests) {
            if (request == null) {
                continue;
            }
            SelfUpgradeEnvironmentProfileEntity entity = request.id() == null
                    ? new SelfUpgradeEnvironmentProfileEntity()
                    : existing.getOrDefault(request.id(), requireEnvironmentProfile(request.id()));
            entity.setCode(requireValue(request.code(), "环境编码").toUpperCase(Locale.ROOT));
            entity.setName(requireValue(request.name(), "环境名称"));
            entity.setBaseUrl(requireValue(request.baseUrl(), "基础地址"));
            entity.setAllowedHostPatternsJson(normalizeJsonArray(request.allowedHostPatternsJson()));
            entity.setLoginScriptJson(normalizeJsonArray(request.loginScriptJson()));
            entity.setSandboxUsername(trimToEmpty(request.sandboxUsername()));
            if (hasText(request.sandboxPassword())) {
                entity.setSandboxPasswordCiphertext(tokenCipherService.encrypt(request.sandboxPassword().trim()));
            }
            if (request.sessionStateJson() != null) {
                String normalizedState = trimToNull(request.sessionStateJson());
                entity.setSessionStateCiphertext(normalizedState == null ? null : tokenCipherService.encrypt(normalizedState));
            }
            entity.setWriteAllowlistJson(normalizeJsonArray(request.writeAllowlistJson()));
            entity.setEnabled(!Boolean.FALSE.equals(request.enabled()));
            toSave.add(entity);
        }
        environmentProfileRepository.saveAll(toSave);
    }

    private AgentEntity requireAgent(Long agentId) {
        return agentRepository.findById(agentId)
                .orElseThrow(() -> new NoSuchElementException("Agent 不存在: " + agentId));
    }

    private ProjectEntity requireProject(Long projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
    }

    private String normalizeJsonArray(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "[]";
        }
        try {
            if (!objectMapper.readTree(normalized).isArray()) {
                throw new IllegalArgumentException("JSON 内容必须是数组");
            }
        } catch (Exception exception) {
            throw new IllegalArgumentException("JSON 数组格式不正确", exception);
        }
        return normalized;
    }

    private String requireValue(String value, String fieldLabel) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(fieldLabel + "不能为空");
        }
        return normalized;
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }
}
