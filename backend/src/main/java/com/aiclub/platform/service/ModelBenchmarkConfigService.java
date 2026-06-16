package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkConfigEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ModelBenchmarkConfigDetail;
import com.aiclub.platform.dto.ModelBenchmarkConfigSummary;
import com.aiclub.platform.dto.ModelBenchmarkRunSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.ModelBenchmarkConfigCreateRequest;
import com.aiclub.platform.dto.request.ModelBenchmarkConfigUpdateRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.ModelBenchmarkConfigRepository;
import com.aiclub.platform.repository.ModelBenchmarkMetricRepository;
import com.aiclub.platform.repository.ModelBenchmarkRunRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 模型对比测试配置服务：承担"配置维度"的 CRUD + 触发运行入口。
 *
 * <p>新模型下，配置可重复编辑、可重复触发；每次触发会克隆当前字段为 run 的快照，
 * 并通过 {@link ModelBenchmarkService#createAndStart} 异步启动执行。</p>
 *
 * <p>强约束：同一份 config 同一时刻只允许一条 active run（PENDING/RUNNING）。
 * 编辑 / 删除 / 再次触发会按此校验，命中即抛 {@link ActiveRunConflictException}（被 controller 转成 409）。</p>
 */
@Service
@Transactional(readOnly = true)
public class ModelBenchmarkConfigService {

    private static final Logger log = LoggerFactory.getLogger(ModelBenchmarkConfigService.class);

    /** 校验"是否存在 active run"用的状态集合。 */
    private static final List<String> ACTIVE_STATUSES = List.of("PENDING", "RUNNING");

    private final ModelBenchmarkConfigRepository configRepository;
    private final ModelBenchmarkRunRepository runRepository;
    private final ModelBenchmarkMetricRepository metricRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final UserRepository userRepository;
    private final ModelBenchmarkService modelBenchmarkService;
    private final ObjectMapper objectMapper;

    public ModelBenchmarkConfigService(ModelBenchmarkConfigRepository configRepository,
                                       ModelBenchmarkRunRepository runRepository,
                                       ModelBenchmarkMetricRepository metricRepository,
                                       AiModelConfigRepository aiModelConfigRepository,
                                       UserRepository userRepository,
                                       ModelBenchmarkService modelBenchmarkService,
                                       ObjectMapper objectMapper) {
        this.configRepository = configRepository;
        this.runRepository = runRepository;
        this.metricRepository = metricRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.userRepository = userRepository;
        this.modelBenchmarkService = modelBenchmarkService;
        this.objectMapper = objectMapper;
    }

    // =================== 列表 / 详情 ===================

    /**
     * 配置列表分页：每条 config 附带最近一次 run 摘要 + 历史运行次数。
     * 单页内对每条 config 各一次 latestRun 查询，page size 较小（默认 10）时无明显代价。
     */
    public PageResponse<ModelBenchmarkConfigSummary> page(int page, int size, String keyword) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "id"));
        Specification<ModelBenchmarkConfigEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.like(cb.lower(root.get("name")), pattern));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Page<ModelBenchmarkConfigEntity> data = configRepository.findAll(spec, pageable);
        Map<Long, String> nicknames = loadNicknames(data.getContent().stream()
                .map(ModelBenchmarkConfigEntity::getCreatedBy).toList());
        Page<ModelBenchmarkConfigSummary> mapped = data.map(entity -> toSummary(entity, nicknames));
        return PageResponse.from(mapped);
    }

    public ModelBenchmarkConfigDetail getDetail(Long id) {
        ModelBenchmarkConfigEntity config = requireConfig(id);
        Map<Long, String> nicknames = loadNicknames(List.of(config.getCreatedBy()));
        long runCount = runRepository.countByConfigId(id);
        ModelBenchmarkRunEntity latest = runRepository
                .findFirstByConfigIdOrderByCreatedAtDescIdDesc(id).orElse(null);
        Long activeRunId = (latest != null && ACTIVE_STATUSES.contains(latest.getStatus())) ? latest.getId() : null;
        return new ModelBenchmarkConfigDetail(
                config.getId(),
                config.getName(),
                config.getConcurrency(),
                config.getTotalRequests(),
                config.getStreamEnabled(),
                config.getMaxTokens(),
                config.getSystemPrompt(),
                config.getUserPrompt(),
                deserializeIds(config.getModelIds()),
                config.getCreatedBy(),
                config.getCreatedBy() == null ? null : nicknames.get(config.getCreatedBy()),
                config.getCreatedAt(),
                config.getUpdatedAt(),
                runCount,
                activeRunId != null,
                activeRunId,
                latest == null ? null : toRunSummary(latest, nicknames)
        );
    }

    // =================== 创建 / 编辑 / 删除 ===================

    @Transactional
    public ModelBenchmarkConfigDetail create(ModelBenchmarkConfigCreateRequest request) {
        validateModels(request.modelIds());

        ModelBenchmarkConfigEntity config = new ModelBenchmarkConfigEntity();
        applyConfigFields(config, request.name(), request.modelIds(), request.concurrency(),
                request.totalRequests(), request.streamEnabled(), request.maxTokens(),
                request.systemPrompt(), request.userPrompt());
        config.setCreatedBy(currentUserId());
        ModelBenchmarkConfigEntity saved = configRepository.save(config);
        return getDetail(saved.getId());
    }

    @Transactional
    public ModelBenchmarkConfigDetail update(Long id, ModelBenchmarkConfigUpdateRequest request) {
        ModelBenchmarkConfigEntity config = requireConfig(id);
        ensureNoActiveRun(id, "配置存在进行中的运行，请先取消后再编辑");

        validateModels(request.modelIds());
        applyConfigFields(config, request.name(), request.modelIds(), request.concurrency(),
                request.totalRequests(), request.streamEnabled(), request.maxTokens(),
                request.systemPrompt(), request.userPrompt());
        configRepository.save(config);
        return getDetail(id);
    }

    /**
     * 删除配置：级联删除其全部 run + metric。
     * 存在 active run 时拒绝（须先取消）。
     */
    @Transactional
    public void delete(Long id) {
        ModelBenchmarkConfigEntity config = requireConfig(id);
        ensureNoActiveRun(id, "配置存在进行中的运行，请先取消后再删除");

        // 单事务级联删除：先 metric，再 run，最后 config
        List<ModelBenchmarkRunEntity> runs = runRepository.findAllByConfigIdOrderByCreatedAtDescIdDesc(id);
        for (ModelBenchmarkRunEntity run : runs) {
            metricRepository.deleteByRunId(run.getId());
        }
        runRepository.deleteAllByConfigId(id);
        configRepository.delete(config);
    }

    // =================== 触发运行 ===================

    /**
     * 触发一次 run。配置当前字段会被拷贝到 run 作为快照。
     *
     * @param id         config id
     * @param nameSuffix 可选，附加到 run.name 末尾（用户用于标记，如 "-上线前"）
     * @return 新生成的 run id
     */
    @Transactional
    public Long triggerRun(Long id, String nameSuffix) {
        ModelBenchmarkConfigEntity config = requireConfig(id);
        ensureNoActiveRun(id, "配置存在进行中的运行，无法再次触发");

        // 把 config 当前字段拼成执行编排所需的请求体
        String runName = config.getName();
        if (hasText(nameSuffix)) {
            String suffix = nameSuffix.trim();
            runName = (runName == null ? "" : runName) + suffix;
            if (runName.length() > 160) {
                runName = runName.substring(0, 160);
            }
        }

        ModelBenchmarkConfigCreateRequest req = new ModelBenchmarkConfigCreateRequest(
                runName,
                deserializeIds(config.getModelIds()),
                config.getConcurrency(),
                config.getTotalRequests(),
                config.getStreamEnabled(),
                config.getMaxTokens(),
                config.getSystemPrompt(),
                config.getUserPrompt()
        );
        return modelBenchmarkService.createAndStart(req, id);
    }

    // =================== 内部工具 ===================

    private void applyConfigFields(ModelBenchmarkConfigEntity config,
                                   String name,
                                   List<Long> modelIds,
                                   Integer concurrency,
                                   Integer totalRequests,
                                   Boolean streamEnabled,
                                   Integer maxTokens,
                                   String systemPrompt,
                                   String userPrompt) {
        config.setName(hasText(name) ? name.trim() : defaultConfigName());
        config.setModelIds(serializeIds(modelIds));
        config.setConcurrency(concurrency);
        config.setTotalRequests(totalRequests);
        config.setStreamEnabled(streamEnabled == null ? Boolean.TRUE : streamEnabled);
        config.setMaxTokens(maxTokens == null ? 512 : maxTokens);
        config.setSystemPrompt(hasText(systemPrompt) ? systemPrompt : ModelBenchmarkService.DEFAULT_SYSTEM_PROMPT);
        config.setUserPrompt(hasText(userPrompt) ? userPrompt : ModelBenchmarkService.DEFAULT_USER_PROMPT);
    }

    private void ensureNoActiveRun(Long configId, String message) {
        if (runRepository.existsByConfigIdAndStatusIn(configId, ACTIVE_STATUSES)) {
            throw new ActiveRunConflictException(message);
        }
    }

    private void validateModels(List<Long> modelIds) {
        Set<Long> unique = new HashSet<>(modelIds);
        if (unique.size() != modelIds.size()) {
            throw new IllegalArgumentException("模型列表存在重复");
        }
        for (Long id : modelIds) {
            AiModelConfigEntity entity = aiModelConfigRepository.findById(id)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + id));
            if (!Boolean.TRUE.equals(entity.getEnabled())) {
                throw new IllegalArgumentException("模型已禁用：" + entity.getName());
            }
            if (!ModelConfigService.MODEL_TYPE_CHAT.equals(entity.getModelType())) {
                throw new IllegalArgumentException("仅支持 CHAT 类型模型参与对比测试：" + entity.getName());
            }
        }
    }

    private ModelBenchmarkConfigSummary toSummary(ModelBenchmarkConfigEntity entity, Map<Long, String> nicknames) {
        List<Long> ids = deserializeIds(entity.getModelIds());
        long runCount = runRepository.countByConfigId(entity.getId());
        ModelBenchmarkRunEntity latest = runRepository
                .findFirstByConfigIdOrderByCreatedAtDescIdDesc(entity.getId()).orElse(null);
        ModelBenchmarkRunSummary latestSummary = latest == null ? null : toRunSummary(latest, nicknames);

        return new ModelBenchmarkConfigSummary(
                entity.getId(),
                entity.getName(),
                entity.getConcurrency(),
                entity.getTotalRequests(),
                entity.getStreamEnabled(),
                entity.getMaxTokens(),
                ids.size(),
                ids,
                entity.getCreatedBy(),
                entity.getCreatedBy() == null ? null : nicknames.get(entity.getCreatedBy()),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                runCount,
                latestSummary
        );
    }

    private ModelBenchmarkRunSummary toRunSummary(ModelBenchmarkRunEntity run, Map<Long, String> nicknames) {
        // run 拼装也可能涉及 createdBy 之外的别人；缺失即按 lookupNickname 兜底
        Long createdBy = run.getCreatedBy();
        String nickname = createdBy == null ? null : nicknames.get(createdBy);
        if (nickname == null && createdBy != null) {
            nickname = userRepository.findById(createdBy).map(UserEntity::getNickname).orElse(null);
        }
        // 实时进度：用内存计数覆盖落库快照（落库是节流刷新）
        Integer progressDone = modelBenchmarkService.peekLiveProgress(run.getId()).orElse(run.getProgressDone());

        List<Long> ids = deserializeIds(run.getModelIds());
        return new ModelBenchmarkRunSummary(
                run.getId(),
                run.getConfigId(),
                run.getName(),
                run.getStatus(),
                run.getConcurrency(),
                run.getTotalRequests(),
                run.getStreamEnabled(),
                run.getMaxTokens(),
                ids.size(),
                ids,
                run.getProgressTotal(),
                progressDone,
                createdBy,
                nickname,
                run.getCreatedAt(),
                run.getUpdatedAt(),
                run.getFinishedAt()
        );
    }

    private Map<Long, String> loadNicknames(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Collections.emptyMap();
        }
        Set<Long> ids = new HashSet<>();
        for (Long id : userIds) {
            if (id != null) {
                ids.add(id);
            }
        }
        if (ids.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<Long, String> map = new HashMap<>();
        for (UserEntity user : userRepository.findAllById(ids)) {
            map.put(user.getId(), user.getNickname());
        }
        return map;
    }

    private ModelBenchmarkConfigEntity requireConfig(Long id) {
        return configRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("对比测试配置不存在: " + id));
    }

    private Long currentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElse(null);
    }

    private String defaultConfigName() {
        return "对比测试配置-" + LocalDateTime.now().withNano(0);
    }

    private String serializeIds(List<Long> ids) {
        try {
            return objectMapper.writeValueAsString(ids);
        } catch (Exception ex) {
            throw new IllegalStateException("无法序列化模型 ID 列表", ex);
        }
    }

    private List<Long> deserializeIds(String json) {
        if (!hasText(json)) {
            return List.of();
        }
        try {
            List<Long> ids = objectMapper.readValue(json, new TypeReference<List<Long>>() {});
            return ids == null ? List.of() : ids;
        } catch (Exception ex) {
            log.warn("failed to deserialize benchmark model ids: {}", json);
            return List.of();
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * 编辑 / 删除 / 触发运行时存在 active run 的统一异常。
     * 由 controller / 全局异常处理器映射为 HTTP 409，code 字段由 controller 内手动设置。
     */
    public static class ActiveRunConflictException extends RuntimeException {
        public ActiveRunConflictException(String message) {
            super(message);
        }
    }
}
