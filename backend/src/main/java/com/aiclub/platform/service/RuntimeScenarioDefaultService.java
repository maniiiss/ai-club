package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RuntimeScenarioDefaultEntity;
import com.aiclub.platform.dto.RuntimeScenarioDefaultSummary;
import com.aiclub.platform.dto.request.RuntimeScenarioDefaultRequest;
import com.aiclub.platform.repository.RuntimeScenarioDefaultRepository;
import com.aiclub.platform.runtime.RuntimeCapability;
import jakarta.validation.Valid;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 平台场景默认 Runtime 服务。
 * 业务意图：统一校验场景能力并为各业务入口提供实时默认路由；任务入口仍会把解析结果写入自己的快照。
 */
@Service
@Transactional(readOnly = true)
public class RuntimeScenarioDefaultService {

    public static final String SCENARIO_ASSISTANT = "ASSISTANT";
    public static final String SCENARIO_CHAT_ROOM = "CHAT_ROOM";
    public static final String SCENARIO_DEVELOPMENT_IMPLEMENTATION = "DEVELOPMENT_IMPLEMENTATION";
    public static final String SCENARIO_TECHNICAL_DESIGN_AUTHORING = "TECHNICAL_DESIGN_AUTHORING";

    private static final Map<String, ScenarioDefinition> DEFINITIONS = definitions();

    private final RuntimeScenarioDefaultRepository repository;
    private final RuntimeRegistryService runtimeRegistryService;

    public RuntimeScenarioDefaultService(RuntimeScenarioDefaultRepository repository,
                                         RuntimeRegistryService runtimeRegistryService) {
        this.repository = repository;
        this.runtimeRegistryService = runtimeRegistryService;
    }

    public List<RuntimeScenarioDefaultSummary> list() {
        return DEFINITIONS.values().stream().map(definition -> {
            RuntimeScenarioDefaultEntity entity = repository.findById(definition.code()).orElse(null);
            String runtimeCode = entity == null || !hasText(entity.getRuntimeRegistryCode())
                    ? definition.fallbackRuntimeCode()
                    : entity.getRuntimeRegistryCode();
            return new RuntimeScenarioDefaultSummary(
                    definition.code(), definition.name(), runtimeCode,
                    definition.requiredCapabilities().stream().map(Enum::name).toList(),
                    entity == null ? null : entity.getUpdatedAt()
            );
        }).toList();
    }

    public String resolve(String scenarioCode) {
        ScenarioDefinition definition = requireDefinition(scenarioCode);
        return repository.findById(definition.code())
                .map(RuntimeScenarioDefaultEntity::getRuntimeRegistryCode)
                .filter(this::hasText)
                .map(value -> value.trim().toUpperCase(Locale.ROOT))
                .orElse(definition.fallbackRuntimeCode());
    }

    @Transactional
    public RuntimeScenarioDefaultSummary update(String scenarioCode,
                                                @Valid RuntimeScenarioDefaultRequest request) {
        ScenarioDefinition definition = requireDefinition(scenarioCode);
        String runtimeCode = normalize(request.runtimeRegistryCode());
        var runtime = runtimeRegistryService.require(runtimeCode);
        if (!runtime.isEnabled()) {
            throw new IllegalArgumentException("不能把已禁用 Runtime 设为场景默认值: " + runtimeCode);
        }
        Set<RuntimeCapability> actual = runtimeRegistryService.descriptor(runtimeCode).capabilities();
        if (!actual.containsAll(definition.requiredCapabilities())) {
            throw new IllegalArgumentException(definition.name() + " 默认 Runtime 缺少能力: " + definition.requiredCapabilities().stream()
                    .filter(item -> !actual.contains(item)).map(Enum::name).toList());
        }
        RuntimeScenarioDefaultEntity entity = repository.findById(definition.code()).orElseGet(RuntimeScenarioDefaultEntity::new);
        entity.setScenarioCode(definition.code());
        entity.setRuntimeRegistryCode(runtimeCode);
        return toSummary(definition, repository.save(entity));
    }

    public ScenarioDefinition requireDefinition(String scenarioCode) {
        String normalized = scenarioCode == null ? "" : scenarioCode.trim().toUpperCase(Locale.ROOT);
        ScenarioDefinition definition = DEFINITIONS.get(normalized);
        if (definition == null) {
            throw new NoSuchElementException("不支持的 Runtime 默认场景: " + normalized);
        }
        return definition;
    }

    private RuntimeScenarioDefaultSummary toSummary(ScenarioDefinition definition, RuntimeScenarioDefaultEntity entity) {
        return new RuntimeScenarioDefaultSummary(
                definition.code(), definition.name(), entity.getRuntimeRegistryCode(),
                definition.requiredCapabilities().stream().map(Enum::name).toList(), entity.getUpdatedAt());
    }

    private static Map<String, ScenarioDefinition> definitions() {
        Map<String, ScenarioDefinition> result = new LinkedHashMap<>();
        result.put(SCENARIO_ASSISTANT, new ScenarioDefinition(SCENARIO_ASSISTANT, "GitPilot 助手", "HERMES_LEGACY", Set.of(RuntimeCapability.CHAT)));
        result.put(SCENARIO_CHAT_ROOM, new ScenarioDefinition(SCENARIO_CHAT_ROOM, "Hearths Agent", "HERMES_LEGACY", Set.of(RuntimeCapability.CHAT)));
        result.put(SCENARIO_DEVELOPMENT_IMPLEMENTATION, new ScenarioDefinition(
                SCENARIO_DEVELOPMENT_IMPLEMENTATION, "开发实现", "CODEX_CLI",
                Set.of(RuntimeCapability.STREAM_EVENTS, RuntimeCapability.PLAN, RuntimeCapability.IMPLEMENT,
                        RuntimeCapability.TEST, RuntimeCapability.REPOSITORY_READ, RuntimeCapability.REPOSITORY_WRITE)));
        result.put(SCENARIO_TECHNICAL_DESIGN_AUTHORING, new ScenarioDefinition(
                SCENARIO_TECHNICAL_DESIGN_AUTHORING, "技术设计", "CODEX_CLI",
                Set.of(RuntimeCapability.STREAM_EVENTS, RuntimeCapability.TECHNICAL_DESIGN, RuntimeCapability.REPOSITORY_READ)));
        return Map.copyOf(result);
    }

    private String normalize(String value) {
        if (!hasText(value)) throw new IllegalArgumentException("Runtime code is required");
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean hasText(String value) { return value != null && !value.isBlank(); }

    public record ScenarioDefinition(String code, String name, String fallbackRuntimeCode,
                                     Set<RuntimeCapability> requiredCapabilities) {
    }
}
