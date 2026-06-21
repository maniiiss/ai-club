package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ModelBenchmarkMetricView;
import com.aiclub.platform.dto.ModelBenchmarkProgressView;
import com.aiclub.platform.dto.ModelBenchmarkRunDetail;
import com.aiclub.platform.dto.ModelBenchmarkRunSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.repository.ModelBenchmarkMetricRepository;
import com.aiclub.platform.repository.ModelBenchmarkRunRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * 模型对比测试运行记录服务：承担对外的运行记录读取、取消、删除、进度查询。
 *
 * <p>列表查询限定在"某个 config 的 run 子集"——新模型下没有"全局 run 列表"概念，
 * 全局视图改为 config 列表（{@link ModelBenchmarkConfigService}）。</p>
 */
@Service
@Transactional(readOnly = true)
public class ModelBenchmarkRunService {

    private static final Logger log = LoggerFactory.getLogger(ModelBenchmarkRunService.class);

    private final ModelBenchmarkRunRepository runRepository;
    private final ModelBenchmarkMetricRepository metricRepository;
    private final UserRepository userRepository;
    private final ModelBenchmarkService modelBenchmarkService;
    private final ObjectMapper objectMapper;

    public ModelBenchmarkRunService(ModelBenchmarkRunRepository runRepository,
                                    ModelBenchmarkMetricRepository metricRepository,
                                    UserRepository userRepository,
                                    ModelBenchmarkService modelBenchmarkService,
                                    ObjectMapper objectMapper) {
        this.runRepository = runRepository;
        this.metricRepository = metricRepository;
        this.userRepository = userRepository;
        this.modelBenchmarkService = modelBenchmarkService;
        this.objectMapper = objectMapper;
    }

    /** 抽屉 Tab 1 用：按时间倒序分页该 config 的 run 历史。 */
    public PageResponse<ModelBenchmarkRunSummary> pageByConfig(Long configId, int page, int size) {
        int pageIndex = Math.max(page - 1, 0);
        int pageSize = Math.max(1, Math.min(size, 100));
        Pageable pageable = PageRequest.of(pageIndex, pageSize);

        // RunRepository 现有方法返回 List；这里手工分页，避免引入额外的派生查询。
        List<ModelBenchmarkRunEntity> all = runRepository.findAllByConfigIdOrderByCreatedAtDescIdDesc(configId);
        int from = Math.min(pageIndex * pageSize, all.size());
        int to = Math.min(from + pageSize, all.size());
        List<ModelBenchmarkRunEntity> slice = all.subList(from, to);

        Map<Long, String> nicknames = loadNicknames(slice.stream()
                .map(ModelBenchmarkRunEntity::getCreatedBy).toList());
        List<ModelBenchmarkRunSummary> summaries = slice.stream()
                .map(entity -> toSummary(entity, nicknames)).toList();
        return PageResponse.from(new PageImpl<>(summaries, pageable, all.size()));
    }

    public ModelBenchmarkRunDetail getDetail(Long id) {
        ModelBenchmarkRunEntity run = requireRun(id);
        List<ModelBenchmarkMetricEntity> metrics = metricRepository.findAllByRunIdOrderByIdAsc(id);
        // 用内存进度覆盖落库快照，实时性更高（落库是节流刷新）
        Integer progressDone = modelBenchmarkService.peekLiveProgress(id).orElse(run.getProgressDone());
        String createdByName = run.getCreatedBy() == null ? null
                : userRepository.findById(run.getCreatedBy()).map(UserEntity::getNickname).orElse(null);
        return new ModelBenchmarkRunDetail(
                run.getId(),
                run.getConfigId(),
                run.getName(),
                run.getStatus(),
                run.getConcurrency(),
                run.getTotalRequests(),
                run.getStreamEnabled(),
                run.getMaxTokens(),
                run.getSystemPrompt(),
                run.getUserPrompt(),
                deserializeIds(run.getModelIds()),
                run.getProgressTotal(),
                progressDone,
                run.getErrorMessage(),
                run.getCreatedBy(),
                createdByName,
                run.getCreatedAt(),
                run.getUpdatedAt(),
                run.getFinishedAt(),
                metrics.stream().map(this::toMetricView).toList()
        );
    }

    public ModelBenchmarkProgressView getProgress(Long id) {
        ModelBenchmarkRunEntity run = requireRun(id);
        int done = modelBenchmarkService.peekLiveProgress(id).orElse(run.getProgressDone());
        return new ModelBenchmarkProgressView(run.getId(), run.getStatus(), run.getProgressTotal(), done, run.getErrorMessage());
    }

    /** 取消运行：委派到执行编排服务。 */
    public void cancel(Long id) {
        modelBenchmarkService.cancel(id);
    }

    /** 删除运行：委派到执行编排服务（连同 metric 一起删）。 */
    public void delete(Long id) {
        modelBenchmarkService.delete(id);
    }

    // =================== 内部工具 ===================

    private ModelBenchmarkRunSummary toSummary(ModelBenchmarkRunEntity entity, Map<Long, String> nicknames) {
        List<Long> ids = deserializeIds(entity.getModelIds());
        Integer progressDone = modelBenchmarkService.peekLiveProgress(entity.getId()).orElse(entity.getProgressDone());
        return new ModelBenchmarkRunSummary(
                entity.getId(),
                entity.getConfigId(),
                entity.getName(),
                entity.getStatus(),
                entity.getConcurrency(),
                entity.getTotalRequests(),
                entity.getStreamEnabled(),
                entity.getMaxTokens(),
                ids.size(),
                ids,
                entity.getProgressTotal(),
                progressDone,
                entity.getCreatedBy(),
                entity.getCreatedBy() == null ? null : nicknames.get(entity.getCreatedBy()),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getFinishedAt()
        );
    }

    private ModelBenchmarkMetricView toMetricView(ModelBenchmarkMetricEntity entity) {
        return new ModelBenchmarkMetricView(
                entity.getId(),
                entity.getRunId(),
                entity.getModelId(),
                entity.getModelName(),
                entity.getProvider(),
                entity.getModelRealName(),
                entity.getStatus(),
                entity.getTotalCount(),
                entity.getSuccessCount(),
                entity.getFailureCount(),
                entity.getFailureRate(),
                entity.getAvgOutputTokens(),
                entity.getAvgTtftMs(),
                entity.getAvgLatencyMs(),
                entity.getP50LatencyMs(),
                entity.getP95LatencyMs(),
                entity.getTotalTokenPerSec(),
                entity.getGenTokenPerSec(),
                entity.getThroughput(),
                entity.getWallTimeMs(),
                entity.getTokenEstimated(),
                entity.getSampleError(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
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

    private ModelBenchmarkRunEntity requireRun(Long id) {
        return runRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("对比测试不存在: " + id));
    }

    private List<Long> deserializeIds(String json) {
        if (json == null || json.trim().isEmpty()) {
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
}
