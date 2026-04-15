package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.RepositoryScanRulesetAdminSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetSummary;
import com.aiclub.platform.dto.RepositoryScanRulesetValidationResult;
import com.aiclub.platform.dto.request.RepositoryScanRulesetRequest;
import com.aiclub.platform.dto.request.RepositoryScanRulesetValidationRequest;
import com.aiclub.platform.repository.RepositoryScanRulesetRepository;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.criteria.Predicate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.MarkedYAMLException;
import org.yaml.snakeyaml.error.YAMLException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 仓库扫描规则集服务。
 * 负责规则集的持久化维护、默认规则集约束和扫描链路读取。
 */
@Service
@Transactional(readOnly = true)
public class RepositoryScanRulesetService {

    /**
     * 当前仅支持 Semgrep 引擎。
     */
    public static final String ENGINE_SEMGREP = "SEMGREP";

    /**
     * 规则 YAML 的最大别名展开数。
     * 用于限制解析阶段资源放大，避免畸形 YAML 拖垮服务线程。
     */
    private static final int YAML_MAX_ALIASES = 50;

    private final RepositoryScanRulesetRepository repositoryScanRulesetRepository;

    public RepositoryScanRulesetService(RepositoryScanRulesetRepository repositoryScanRulesetRepository) {
        this.repositoryScanRulesetRepository = repositoryScanRulesetRepository;
    }

    /**
     * 应用启动后若规则集表为空，则自动导入内置默认规则集。
     * 这样可以保持现有部署在升级后仍能立即发起扫描。
     */
    @PostConstruct
    @Transactional
    public void initializeBuiltInRulesetIfNecessary() {
        if (repositoryScanRulesetRepository.count() > 0) {
            return;
        }
        RepositoryScanRulesetEntity entity = new RepositoryScanRulesetEntity();
        entity.setCode("team-default");
        entity.setName("团队默认规则集");
        entity.setDescription("面向 Java、TypeScript、Python 的基础团队规范检查。");
        entity.setEngineType(ENGINE_SEMGREP);
        entity.setEnabled(true);
        entity.setDefaultSelected(true);
        entity.setDefinitionContent(loadBuiltInRulesetContent());
        repositoryScanRulesetRepository.save(entity);
    }

    /**
     * 分页查询后台规则集。
     */
    public PageResponse<RepositoryScanRulesetAdminSummary> pageRulesets(int page, int size, String keyword, String engineType, Boolean enabled) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.ASC, "id"));
        Page<RepositoryScanRulesetAdminSummary> pageData = repositoryScanRulesetRepository
                .findAll(buildSpecification(keyword, engineType, enabled), pageable)
                .map(this::toAdminSummary);
        return PageResponse.from(pageData);
    }

    /**
     * 查询后台规则集详情。
     */
    public RepositoryScanRulesetAdminSummary getRuleset(Long id) {
        return toAdminSummary(requireRuleset(id));
    }

    /**
     * 返回发起扫描时可见的启用规则集列表。
     */
    public List<RepositoryScanRulesetSummary> listEnabledRulesets() {
        return repositoryScanRulesetRepository.findAllByEnabledTrueOrderByDefaultSelectedDescIdAsc().stream()
                .map(this::toSummary)
                .toList();
    }

    /**
     * 按编码获取规则集快照来源。
     */
    public RepositoryScanRulesetEntity requireRulesetByCode(String code) {
        return repositoryScanRulesetRepository.findByCodeIgnoreCase(defaultString(code))
                .orElseThrow(() -> new NoSuchElementException("扫描规则集不存在: " + defaultString(code)));
    }

    /**
     * 查询当前默认规则集。
     */
    public RepositoryScanRulesetEntity requireDefaultRuleset() {
        return repositoryScanRulesetRepository.findFirstByDefaultSelectedTrueOrderByIdAsc()
                .orElseThrow(() -> new NoSuchElementException("当前未配置默认扫描规则集"));
    }

    /**
     * 创建新规则集。
     */
    @Transactional
    public RepositoryScanRulesetAdminSummary createRuleset(RepositoryScanRulesetRequest request) {
        String code = normalizeCode(request.code());
        if (repositoryScanRulesetRepository.findByCodeIgnoreCase(code).isPresent()) {
            throw new IllegalArgumentException("规则集编码已存在");
        }
        RepositoryScanRulesetEntity entity = new RepositoryScanRulesetEntity();
        fillEntity(entity, request, true);
        RepositoryScanRulesetEntity saved = repositoryScanRulesetRepository.save(entity);
        if (Boolean.TRUE.equals(saved.getDefaultSelected())) {
            repositoryScanRulesetRepository.clearDefaultSelectedExcept(saved.getId());
        }
        return toAdminSummary(saved);
    }

    /**
     * 手动校验规则内容。
     * 供前端在保存前主动检查 YAML 是否满足当前平台可接受的最小结构。
     */
    public RepositoryScanRulesetValidationResult validateRuleset(RepositoryScanRulesetValidationRequest request) {
        String normalizedEngineType = normalizeEngineType(request.engineType());
        String normalizedDefinitionContent = normalizeDefinitionContent(request.definitionContent());
        validateDefinitionContent(normalizedEngineType, normalizedDefinitionContent);
        return new RepositoryScanRulesetValidationResult(true, "规则校验通过，可以保存。");
    }

    /**
     * 更新既有规则集。
     * 规则集编码和引擎类型创建后固定，不允许后续修改。
     */
    @Transactional
    public RepositoryScanRulesetAdminSummary updateRuleset(Long id, RepositoryScanRulesetRequest request) {
        RepositoryScanRulesetEntity entity = requireRuleset(id);
        String normalizedCode = normalizeCode(request.code());
        String normalizedEngineType = normalizeEngineType(request.engineType());
        if (!entity.getCode().equalsIgnoreCase(normalizedCode)) {
            throw new IllegalArgumentException("规则集编码创建后不允许修改");
        }
        if (!entity.getEngineType().equalsIgnoreCase(normalizedEngineType)) {
            throw new IllegalArgumentException("扫描引擎创建后不允许修改");
        }
        fillEntity(entity, request, false);
        validateDefaultSelectionOnUpdate(entity);
        RepositoryScanRulesetEntity saved = repositoryScanRulesetRepository.save(entity);
        if (Boolean.TRUE.equals(saved.getDefaultSelected())) {
            repositoryScanRulesetRepository.clearDefaultSelectedExcept(saved.getId());
        }
        return toAdminSummary(saved);
    }

    /**
     * 将实体映射为对 GitLab 发起扫描页面开放的摘要对象。
     */
    public RepositoryScanRulesetSummary toSummary(RepositoryScanRulesetEntity entity) {
        return new RepositoryScanRulesetSummary(
                entity.getCode(),
                entity.getName(),
                entity.getDescription(),
                entity.getEngineType(),
                Boolean.TRUE.equals(entity.getDefaultSelected())
        );
    }

    /**
     * 构建执行任务要固化的规则快照。
     */
    public java.util.Map<String, Object> buildRulesetSnapshot(RepositoryScanRulesetEntity entity) {
        java.util.LinkedHashMap<String, Object> snapshot = new java.util.LinkedHashMap<>();
        snapshot.put("code", defaultString(entity.getCode()));
        snapshot.put("name", defaultString(entity.getName()));
        snapshot.put("engineType", defaultString(entity.getEngineType()));
        snapshot.put("definitionContent", defaultString(entity.getDefinitionContent()));
        return java.util.Map.copyOf(snapshot);
    }

    private void fillEntity(RepositoryScanRulesetEntity entity, RepositoryScanRulesetRequest request, boolean createMode) {
        String normalizedEngineType = normalizeEngineType(request.engineType());
        String normalizedDefinitionContent = normalizeDefinitionContent(request.definitionContent());
        validateDefinitionContent(normalizedEngineType, normalizedDefinitionContent);
        if (createMode) {
            entity.setCode(normalizeCode(request.code()));
            entity.setEngineType(normalizedEngineType);
        }
        entity.setName(requireValue(request.name(), "规则集名称"));
        entity.setDescription(defaultString(request.description()).trim());
        entity.setEnabled(request.enabled() == null || request.enabled());
        entity.setDefaultSelected(Boolean.TRUE.equals(request.defaultSelected()));
        entity.setDefinitionContent(normalizedDefinitionContent);
    }

    /**
     * 禁用或取消默认时需要避免出现“系统没有默认规则集”的无效状态。
     */
    private void validateDefaultSelectionOnUpdate(RepositoryScanRulesetEntity entity) {
        boolean enabled = Boolean.TRUE.equals(entity.getEnabled());
        boolean defaultSelected = Boolean.TRUE.equals(entity.getDefaultSelected());
        if (enabled && defaultSelected) {
            return;
        }
        long defaultCount = repositoryScanRulesetRepository.countByDefaultSelectedTrue();
        boolean isCurrentDefault = Boolean.TRUE.equals(requireRuleset(entity.getId()).getDefaultSelected());
        if (isCurrentDefault && defaultCount <= 1) {
            if (!enabled) {
                throw new IllegalArgumentException("不能禁用当前唯一默认规则集，请先设置其他默认规则集");
            }
            if (!defaultSelected) {
                throw new IllegalArgumentException("不能取消当前唯一默认规则集，请先设置其他默认规则集");
            }
        }
    }

    private Specification<RepositoryScanRulesetEntity> buildSpecification(String keyword, String engineType, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("code")), pattern),
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (hasText(engineType)) {
                predicates.add(cb.equal(root.get("engineType"), normalizeEngineType(engineType)));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private RepositoryScanRulesetEntity requireRuleset(Long id) {
        return repositoryScanRulesetRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("扫描规则集不存在: " + id));
    }

    private RepositoryScanRulesetAdminSummary toAdminSummary(RepositoryScanRulesetEntity entity) {
        return new RepositoryScanRulesetAdminSummary(
                entity.getId(),
                entity.getCode(),
                entity.getName(),
                entity.getDescription(),
                entity.getEngineType(),
                Boolean.TRUE.equals(entity.getEnabled()),
                Boolean.TRUE.equals(entity.getDefaultSelected()),
                entity.getDefinitionContent()
        );
    }

    private String normalizeCode(String code) {
        String value = requireValue(code, "规则集编码").trim();
        if (!value.matches("[A-Za-z0-9._-]+")) {
            throw new IllegalArgumentException("规则集编码仅支持字母、数字、点、下划线和中划线");
        }
        return value;
    }

    private String normalizeEngineType(String engineType) {
        String normalized = requireValue(engineType, "扫描引擎").trim().toUpperCase();
        if (!ENGINE_SEMGREP.equals(normalized)) {
            throw new IllegalArgumentException("当前仅支持 SEMGREP 扫描引擎");
        }
        return normalized;
    }

    private String normalizeDefinitionContent(String definitionContent) {
        String normalized = requireValue(definitionContent, "规则内容").replace("\r\n", "\n").trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("规则内容不能为空");
        }
        return normalized + "\n";
    }

    /**
     * 对 Semgrep 规则内容做真实 YAML 解析与最小结构校验。
     * 这样既能拦截缩进/冒号等语法问题，也能尽早识别不符合平台预期的顶层结构。
     */
    private void validateDefinitionContent(String engineType, String definitionContent) {
        if (!ENGINE_SEMGREP.equals(engineType)) {
            throw new IllegalArgumentException("当前仅支持 SEMGREP 扫描引擎");
        }
        String normalized = definitionContent == null ? "" : definitionContent.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("规则内容不能为空");
        }
        Object yamlRoot = parseYaml(normalized);
        if (!(yamlRoot instanceof Map<?, ?> rootMap)) {
            throw new IllegalArgumentException("Semgrep 规则内容的顶层必须是对象，并包含 rules 字段");
        }
        Object rulesValue = rootMap.get("rules");
        if (!(rulesValue instanceof List<?> rules)) {
            throw new IllegalArgumentException("Semgrep 规则内容必须包含 rules 列表");
        }
        if (rules.isEmpty()) {
            throw new IllegalArgumentException("Semgrep 规则内容至少需要定义一条规则");
        }
        Object firstRule = rules.get(0);
        if (!(firstRule instanceof Map<?, ?> firstRuleMap)) {
            throw new IllegalArgumentException("Semgrep 每条规则都必须是对象结构");
        }
        Object firstRuleId = firstRuleMap.get("id");
        if (!(firstRuleId instanceof String firstRuleIdText) || firstRuleIdText.trim().isEmpty()) {
            throw new IllegalArgumentException("Semgrep 规则内容缺少规则项 id，请至少为每条规则配置 id");
        }
    }

    /**
     * 使用 SnakeYAML 解析文本，确保 YAML 语法可被真实加载。
     */
    private Object parseYaml(String content) {
        try {
            LoaderOptions loaderOptions = new LoaderOptions();
            loaderOptions.setMaxAliasesForCollections(YAML_MAX_ALIASES);
            loaderOptions.setAllowDuplicateKeys(false);
            loaderOptions.setCodePointLimit(3_000_000);
            Yaml yaml = new Yaml(loaderOptions);
            Object parsed = yaml.load(content);
            return parsed == null ? new LinkedHashMap<>() : parsed;
        } catch (MarkedYAMLException exception) {
            int line = exception.getProblemMark() == null ? -1 : exception.getProblemMark().getLine() + 1;
            int column = exception.getProblemMark() == null ? -1 : exception.getProblemMark().getColumn() + 1;
            String location = line > 0 && column > 0 ? "第 " + line + " 行第 " + column + " 列" : "未知位置";
            String problem = exception.getProblem() == null || exception.getProblem().isBlank()
                    ? "YAML 语法错误"
                    : exception.getProblem().trim();
            throw new IllegalArgumentException("YAML 解析失败，" + location + "：" + problem, exception);
        } catch (YAMLException exception) {
            String message = exception.getMessage() == null || exception.getMessage().isBlank()
                    ? "YAML 语法错误"
                    : exception.getMessage().trim();
            throw new IllegalArgumentException("YAML 解析失败：" + message, exception);
        }
    }

    private String loadBuiltInRulesetContent() {
        try {
            ClassPathResource resource = new ClassPathResource("repository-scan-rulesets/team-default.yml");
            return new String(resource.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("读取内置扫描规则集失败", exception);
        }
    }

    private String requireValue(String value, String fieldName) {
        if (!hasText(value)) {
            throw new IllegalArgumentException(fieldName + "不能为空");
        }
        return value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
