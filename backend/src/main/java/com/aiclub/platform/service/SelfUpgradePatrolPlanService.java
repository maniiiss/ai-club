package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.SelfUpgradeEnvironmentProfileEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolTargetEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.SelfUpgradePatrolPlanSummary;
import com.aiclub.platform.dto.SelfUpgradePatrolTargetSummary;
import com.aiclub.platform.dto.request.SelfUpgradePatrolPlanRequest;
import com.aiclub.platform.dto.request.SelfUpgradePatrolTargetRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolPlanRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolTargetRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 自升级巡检计划服务。
 * 负责计划与目标入口的 CRUD、Cron 校验以及定时触发去重所需的计划元数据维护。
 */
@Service
@Transactional(readOnly = true)
public class SelfUpgradePatrolPlanService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SelfUpgradePatrolPlanRepository patrolPlanRepository;
    private final SelfUpgradePatrolTargetRepository patrolTargetRepository;
    private final SelfUpgradeConfigService selfUpgradeConfigService;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final ObjectMapper objectMapper;

    public SelfUpgradePatrolPlanService(SelfUpgradePatrolPlanRepository patrolPlanRepository,
                                        SelfUpgradePatrolTargetRepository patrolTargetRepository,
                                        SelfUpgradeConfigService selfUpgradeConfigService,
                                        AiModelConfigRepository aiModelConfigRepository,
                                        ObjectMapper objectMapper) {
        this.patrolPlanRepository = patrolPlanRepository;
        this.patrolTargetRepository = patrolTargetRepository;
        this.selfUpgradeConfigService = selfUpgradeConfigService;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.objectMapper = objectMapper;
    }

    public PageResponse<SelfUpgradePatrolPlanSummary> pagePlans(int page, int size, String keyword, Boolean enabled) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "updatedAt", "id"));
        Page<SelfUpgradePatrolPlanSummary> pageData = patrolPlanRepository.findAll(planSpecification(keyword, enabled), pageable)
                .map(this::toPlanSummary);
        return PageResponse.from(pageData);
    }

    public SelfUpgradePatrolPlanSummary getPlan(Long planId) {
        return toPlanSummary(requirePlan(planId));
    }

    @Transactional
    public SelfUpgradePatrolPlanSummary createPlan(SelfUpgradePatrolPlanRequest request) {
        SelfUpgradePatrolPlanEntity entity = new SelfUpgradePatrolPlanEntity();
        applyPlanRequest(entity, request);
        SelfUpgradePatrolPlanEntity saved = patrolPlanRepository.save(entity);
        syncTargets(saved, request.targets());
        return toPlanSummary(saved);
    }

    @Transactional
    public SelfUpgradePatrolPlanSummary updatePlan(Long planId, SelfUpgradePatrolPlanRequest request) {
        SelfUpgradePatrolPlanEntity entity = requirePlan(planId);
        applyPlanRequest(entity, request);
        SelfUpgradePatrolPlanEntity saved = patrolPlanRepository.save(entity);
        syncTargets(saved, request.targets());
        return toPlanSummary(saved);
    }

    @Transactional
    public void deletePlan(Long planId) {
        patrolPlanRepository.delete(requirePlan(planId));
    }

    @Transactional
    public SelfUpgradePatrolPlanSummary setPlanEnabled(Long planId, boolean enabled) {
        SelfUpgradePatrolPlanEntity entity = requirePlan(planId);
        entity.setEnabled(enabled);
        return toPlanSummary(patrolPlanRepository.save(entity));
    }

    @Transactional
    public void markScheduled(Long planId, LocalDateTime scheduledAt) {
        SelfUpgradePatrolPlanEntity plan = requirePlan(planId);
        plan.setLastScheduledAt(scheduledAt);
        patrolPlanRepository.save(plan);
    }

    @Transactional
    public void markLastRun(Long planId, String status, String message, LocalDateTime runAt) {
        SelfUpgradePatrolPlanEntity plan = requirePlan(planId);
        plan.setLastRunStatus(trimToNull(status));
        plan.setLastRunMessage(limit(message, 1000));
        plan.setLastRunAt(runAt);
        patrolPlanRepository.save(plan);
    }

    public SelfUpgradePatrolPlanEntity requirePlan(Long planId) {
        return patrolPlanRepository.findById(planId)
                .orElseThrow(() -> new NoSuchElementException("巡检计划不存在: " + planId));
    }

    public List<SelfUpgradePatrolTargetEntity> listTargets(Long planId) {
        return patrolTargetRepository.findAllByPlan_IdOrderBySortOrderAscIdAsc(planId);
    }

    public List<SelfUpgradePatrolPlanEntity> listEnabledPlans() {
        return patrolPlanRepository.findAllByEnabledTrueOrderByIdAsc();
    }

    public SelfUpgradePatrolPlanSummary toPlanSummary(SelfUpgradePatrolPlanEntity entity) {
        List<SelfUpgradePatrolTargetSummary> targets = patrolTargetRepository.findAllByPlan_IdOrderBySortOrderAscIdAsc(entity.getId()).stream()
                .map(this::toTargetSummary)
                .toList();
        return new SelfUpgradePatrolPlanSummary(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getEnvironmentProfile() == null ? null : entity.getEnvironmentProfile().getId(),
                entity.getEnvironmentProfile() == null ? null : entity.getEnvironmentProfile().getName(),
                entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getId(),
                entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getName(),
                entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getProvider(),
                entity.getAiModelConfig() == null ? null : entity.getAiModelConfig().getModelName(),
                entity.getSchedulerCron(),
                entity.isSchedulerEnabled(),
                entity.getMaxExplorationSteps(),
                entity.getTargetTimeoutSeconds(),
                entity.getRunTimeoutSeconds(),
                entity.isEnabled(),
                entity.getLastRunStatus(),
                entity.getLastRunMessage(),
                formatTime(entity.getLastRunAt()),
                formatTime(entity.getLastScheduledAt()),
                targets
        );
    }

    public SelfUpgradePatrolTargetSummary toTargetSummary(SelfUpgradePatrolTargetEntity entity) {
        return new SelfUpgradePatrolTargetSummary(
                entity.getId(),
                entity.getName(),
                entity.getSeedUrl(),
                defaultString(entity.getGoalPrompt()),
                entity.getReadySelector(),
                entity.isAllowWrite(),
                defaultString(entity.getWriteAllowlistOverrideJson()),
                entity.getMaxStepsOverride(),
                entity.getSortOrder(),
                entity.isEnabled()
        );
    }

    private Specification<SelfUpgradePatrolPlanEntity> planSpecification(String keyword, Boolean enabled) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (enabled != null) {
                predicates.add(cb.equal(root.get("enabled"), enabled));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private void applyPlanRequest(SelfUpgradePatrolPlanEntity entity, SelfUpgradePatrolPlanRequest request) {
        SelfUpgradeEnvironmentProfileEntity environmentProfile = selfUpgradeConfigService.requireEnvironmentProfile(request.environmentProfileId());
        AiModelConfigEntity aiModelConfig = requireChatModelConfig(request.aiModelConfigId());
        entity.setName(requireValue(request.name(), "计划名称"));
        entity.setDescription(defaultString(request.description()));
        entity.setEnvironmentProfile(environmentProfile);
        entity.setAiModelConfig(aiModelConfig);
        entity.setSchedulerCron(normalizeCron(request.schedulerCron()));
        entity.setSchedulerEnabled(Boolean.TRUE.equals(request.schedulerEnabled()));
        entity.setMaxExplorationSteps(normalizePositive(request.maxExplorationSteps(), 25, "最大探索步数"));
        entity.setTargetTimeoutSeconds(normalizePositive(request.targetTimeoutSeconds(), 600, "目标超时时间"));
        entity.setRunTimeoutSeconds(normalizePositive(request.runTimeoutSeconds(), 1800, "运行超时时间"));
        entity.setEnabled(Boolean.TRUE.equals(request.enabled()));
    }

    /**
     * 目标入口是计划的一部分，这里按前端提交的完整列表做增删改同步，避免残留历史入口继续被夜间任务执行。
     */
    private void syncTargets(SelfUpgradePatrolPlanEntity plan, List<SelfUpgradePatrolTargetRequest> targetRequests) {
        Map<Long, SelfUpgradePatrolTargetEntity> existing = new LinkedHashMap<>();
        patrolTargetRepository.findAllByPlan_IdOrderBySortOrderAscIdAsc(plan.getId()).forEach(item -> existing.put(item.getId(), item));
        List<SelfUpgradePatrolTargetEntity> toSave = new ArrayList<>();
        Set<Long> retainedIds = new java.util.LinkedHashSet<>();
        int sortOrder = 0;
        for (SelfUpgradePatrolTargetRequest request : targetRequests == null ? List.<SelfUpgradePatrolTargetRequest>of() : targetRequests) {
            if (request == null) {
                continue;
            }
            SelfUpgradePatrolTargetEntity entity = request.id() == null
                    ? new SelfUpgradePatrolTargetEntity()
                    : existing.getOrDefault(request.id(), requireTarget(request.id(), plan.getId()));
            entity.setPlan(plan);
            entity.setName(requireValue(request.name(), "目标名称"));
            entity.setSeedUrl(requireValue(request.seedUrl(), "入口地址"));
            entity.setGoalPrompt(defaultString(request.goalPrompt()));
            entity.setReadySelector(trimToNull(request.readySelector()));
            entity.setAllowWrite(Boolean.TRUE.equals(request.allowWrite()));
            entity.setWriteAllowlistOverrideJson(normalizeJsonArray(request.writeAllowlistOverrideJson()));
            entity.setMaxStepsOverride(request.maxStepsOverride());
            entity.setSortOrder(request.sortOrder() == null ? sortOrder : request.sortOrder());
            entity.setEnabled(!Boolean.FALSE.equals(request.enabled()));
            toSave.add(entity);
            sortOrder += 10;
            if (entity.getId() != null) {
                retainedIds.add(entity.getId());
            }
        }
        List<SelfUpgradePatrolTargetEntity> saved = patrolTargetRepository.saveAll(toSave);
        saved.stream().map(SelfUpgradePatrolTargetEntity::getId).filter(Objects::nonNull).forEach(retainedIds::add);
        existing.values().stream()
                .filter(item -> item.getId() != null && !retainedIds.contains(item.getId()))
                .forEach(patrolTargetRepository::delete);
    }

    private SelfUpgradePatrolTargetEntity requireTarget(Long targetId, Long planId) {
        SelfUpgradePatrolTargetEntity target = patrolTargetRepository.findById(targetId)
                .orElseThrow(() -> new NoSuchElementException("巡检目标不存在: " + targetId));
        if (!Objects.equals(target.getPlan().getId(), planId)) {
            throw new IllegalArgumentException("巡检目标不属于当前计划");
        }
        return target;
    }

    private String normalizeCron(String cron) {
        String normalized = trimToNull(cron);
        if (normalized == null) {
            return null;
        }
        try {
            CronExpression.parse(normalized);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("调度 Cron 表达式格式不正确");
        }
        return normalized;
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

    private Integer normalizePositive(Integer value, int defaultValue, String fieldLabel) {
        int normalized = value == null ? defaultValue : value;
        if (normalized <= 0) {
            throw new IllegalArgumentException(fieldLabel + "必须大于0");
        }
        return normalized;
    }

    /**
     * 巡检计划只允许绑定 CHAT 模型，避免在执行期才发现选中了 Embedding 等不可用模型。
     */
    private AiModelConfigEntity requireChatModelConfig(Long modelConfigId) {
        AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(modelConfigId)
                .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + modelConfigId));
        if (!ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()))) {
            throw new IllegalArgumentException("巡检计划必须绑定对话模型");
        }
        if (!Boolean.TRUE.equals(modelConfig.getEnabled())) {
            throw new IllegalArgumentException("巡检计划绑定的模型已停用");
        }
        return modelConfig;
    }

    private String requireValue(String value, String fieldLabel) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new IllegalArgumentException(fieldLabel + "不能为空");
        }
        return normalized;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
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
