package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunTargetEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolTargetEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.SelfUpgradeArtifactLink;
import com.aiclub.platform.dto.SelfUpgradePatrolRunSummary;
import com.aiclub.platform.dto.SelfUpgradePatrolRunTargetSummary;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunRepository;
import com.aiclub.platform.repository.SelfUpgradePatrolRunTargetRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 自升级巡检运行服务。
 * 负责运行记录与目标结果的中心内视图，不把前端直接耦合到 execution_task / execution_run 明细结构。
 */
@Service
@Transactional(readOnly = true)
public class SelfUpgradePatrolRunService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SelfUpgradePatrolRunRepository patrolRunRepository;
    private final SelfUpgradePatrolRunTargetRepository patrolRunTargetRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;

    public SelfUpgradePatrolRunService(SelfUpgradePatrolRunRepository patrolRunRepository,
                                       SelfUpgradePatrolRunTargetRepository patrolRunTargetRepository,
                                       ExecutionArtifactRepository executionArtifactRepository) {
        this.patrolRunRepository = patrolRunRepository;
        this.patrolRunTargetRepository = patrolRunTargetRepository;
        this.executionArtifactRepository = executionArtifactRepository;
    }

    public PageResponse<SelfUpgradePatrolRunSummary> pageRuns(int page, int size, Long planId, String status) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        Page<SelfUpgradePatrolRunSummary> pageData = patrolRunRepository.findAll(runSpecification(planId, status), pageable)
                .map(this::toRunSummary);
        return PageResponse.from(pageData);
    }

    public SelfUpgradePatrolRunSummary getRun(Long runId) {
        return toRunSummary(requireRun(runId));
    }

    @Transactional
    public SelfUpgradePatrolRunEntity createPendingRun(SelfUpgradePatrolPlanEntity plan, String triggerMode, UserEntity createdByUser) {
        SelfUpgradePatrolRunEntity run = new SelfUpgradePatrolRunEntity();
        run.setPlan(plan);
        run.setEnvironmentProfile(plan.getEnvironmentProfile());
        run.setStatus("RUNNING");
        run.setTriggerMode(defaultString(triggerMode).isBlank() ? "MANUAL" : triggerMode.trim().toUpperCase());
        run.setCreatedByUser(createdByUser);
        run.setStartedAt(LocalDateTime.now());
        return patrolRunRepository.save(run);
    }

    @Transactional
    public void initializeRunTargets(SelfUpgradePatrolRunEntity run, List<SelfUpgradePatrolTargetEntity> targets) {
        List<SelfUpgradePatrolRunTargetEntity> entities = new ArrayList<>();
        for (SelfUpgradePatrolTargetEntity target : targets) {
            SelfUpgradePatrolRunTargetEntity item = new SelfUpgradePatrolRunTargetEntity();
            item.setRun(run);
            item.setPlanTarget(target);
            item.setTargetName(target.getName());
            item.setSeedUrl(target.getSeedUrl());
            item.setStatus("PENDING");
            entities.add(item);
        }
        patrolRunTargetRepository.saveAll(entities);
        run.setTotalTargetCount(entities.size());
        patrolRunRepository.save(run);
    }

    public SelfUpgradePatrolRunEntity requireRun(Long runId) {
        return patrolRunRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("巡检运行不存在: " + runId));
    }

    public List<SelfUpgradePatrolRunTargetEntity> listRunTargets(Long runId) {
        return patrolRunTargetRepository.findAllByRun_IdOrderByIdAsc(runId);
    }

    public SelfUpgradePatrolRunSummary toRunSummary(SelfUpgradePatrolRunEntity entity) {
        List<SelfUpgradePatrolRunTargetSummary> targets = patrolRunTargetRepository.findAllByRun_IdOrderByIdAsc(entity.getId()).stream()
                .map(target -> toRunTargetSummary(target, buildArtifactMap(entity)))
                .toList();
        return new SelfUpgradePatrolRunSummary(
                entity.getId(),
                entity.getPlan() == null ? null : entity.getPlan().getId(),
                entity.getPlan() == null ? null : entity.getPlan().getName(),
                entity.getEnvironmentProfile() == null ? null : entity.getEnvironmentProfile().getId(),
                entity.getEnvironmentProfile() == null ? null : entity.getEnvironmentProfile().getName(),
                entity.getStatus(),
                entity.getTriggerMode(),
                entity.getLinkedExecutionTask() == null ? null : entity.getLinkedExecutionTask().getId(),
                entity.getTotalTargetCount(),
                entity.getSuccessTargetCount(),
                entity.getPartialSuccessTargetCount(),
                entity.getFailedTargetCount(),
                entity.getSuggestionCount(),
                entity.getOpenedSuggestionCount(),
                entity.getReopenedSuggestionCount(),
                entity.getSummary(),
                entity.getCreatedByUser() == null ? null : entity.getCreatedByUser().getId(),
                entity.getCreatedByUser() == null ? null : displayName(entity.getCreatedByUser()),
                formatTime(entity.getStartedAt()),
                formatTime(entity.getFinishedAt()),
                formatTime(entity.getCreatedAt()),
                targets
        );
    }

    public SelfUpgradePatrolRunTargetSummary toRunTargetSummary(SelfUpgradePatrolRunTargetEntity entity,
                                                                Map<String, SelfUpgradeArtifactLink> artifactMap) {
        List<SelfUpgradeArtifactLink> artifacts = new ArrayList<>();
        for (SelfUpgradeArtifactLink item : artifactMap.values()) {
            if (item.contentRef() != null && defaultString(entity.getArtifactRefsJson()).contains(item.contentRef())) {
                artifacts.add(item);
            }
        }
        return new SelfUpgradePatrolRunTargetSummary(
                entity.getId(),
                entity.getPlanTarget() == null ? null : entity.getPlanTarget().getId(),
                entity.getTargetName(),
                entity.getSeedUrl(),
                entity.getStatus(),
                entity.getPagePath(),
                entity.getStepCount(),
                entity.getFindingCount(),
                entity.getSkippedGuardrailCount(),
                entity.getSummary(),
                artifacts,
                formatTime(entity.getStartedAt()),
                formatTime(entity.getFinishedAt())
        );
    }

    private Specification<SelfUpgradePatrolRunEntity> runSpecification(Long planId, String status) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (planId != null) {
                predicates.add(cb.equal(root.get("plan").get("id"), planId));
            }
            if (status != null && !status.trim().isEmpty()) {
                predicates.add(cb.equal(root.get("status"), status.trim().toUpperCase()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Map<String, SelfUpgradeArtifactLink> buildArtifactMap(SelfUpgradePatrolRunEntity run) {
        Map<String, SelfUpgradeArtifactLink> result = new LinkedHashMap<>();
        if (run.getLinkedExecutionTask() == null || run.getLinkedExecutionTask().getCurrentRun() == null) {
            return result;
        }
        ExecutionRunEntity executionRun = run.getLinkedExecutionTask().getCurrentRun();
        for (ExecutionArtifactEntity artifact : executionArtifactRepository.findAllByRun_IdOrderByCreatedAtAscIdAsc(executionRun.getId())) {
            String contentRef = artifact.getContentRef();
            SelfUpgradeArtifactLink item = new SelfUpgradeArtifactLink(
                    artifact.getId(),
                    artifact.getArtifactType(),
                    artifact.getTitle(),
                    contentRef,
                    artifact.getContentText(),
                    artifact.getId() == null ? null : "/api/execution-artifacts/" + artifact.getId() + "/download"
            );
            result.put(defaultString(contentRef) + "#" + artifact.getId(), item);
            if (contentRef != null) {
                result.put(contentRef, item);
            }
        }
        return result;
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? user.getUsername() : nickname;
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? null : time.format(TIME_FORMATTER);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
