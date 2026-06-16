package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ModelBenchmarkMetricView;
import com.aiclub.platform.dto.ModelBenchmarkProgressView;
import com.aiclub.platform.dto.ModelBenchmarkRunDetail;
import com.aiclub.platform.dto.ModelBenchmarkRunSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.ModelBenchmarkCreateRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.ModelBenchmarkMetricRepository;
import com.aiclub.platform.repository.ModelBenchmarkRunRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.ModelConfigService.ResolvedModelConfig;
import com.aiclub.platform.service.benchmark.BenchmarkInvocationResult;
import com.aiclub.platform.service.benchmark.BenchmarkInvoker;
import com.aiclub.platform.service.benchmark.ModelBenchmarkMetrics;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 模型对比测试服务：
 * - 创建 run 后立即返回，由 benchmarkRunExecutor 编排各模型逐个执行；
 * - 每个模型内部通过 Semaphore 控制并发上限，请求实际由 benchmarkWorkerExecutor 发出；
 * - 进度通过内存计数 + 周期性写库的方式更新，避免高频 DB 写。
 */
@Service
@Transactional(readOnly = true)
public class ModelBenchmarkService {

    private static final Logger log = LoggerFactory.getLogger(ModelBenchmarkService.class);

    /** 默认 user prompt：要求模型生成稳定长度的输出，便于跨模型比较 token/s 与平均输出。 */
    public static final String DEFAULT_USER_PROMPT =
            "请用中文写一段约 200 字的产品介绍，介绍一款叫做\"AI 工程平台\"的协作工具，需包含核心能力、目标人群与使用场景。请直接给出正文，不要列项目编号。";
    public static final String DEFAULT_SYSTEM_PROMPT = "You are a concise technical writer.";

    /** 进度落库节流阈值：完成 N 次请求或距离上次落库 200ms，才更新一次。 */
    private static final int PROGRESS_FLUSH_BATCH = 5;
    private static final long PROGRESS_FLUSH_INTERVAL_MS = 200L;

    private final ModelBenchmarkRunRepository runRepository;
    private final ModelBenchmarkMetricRepository metricRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final UserRepository userRepository;
    private final ModelConfigService modelConfigService;
    private final BenchmarkInvoker benchmarkInvoker;
    private final ObjectMapper objectMapper;
    private final Executor benchmarkRunExecutor;
    private final Executor benchmarkWorkerExecutor;

    /** runId -> 进度计数器，供 progress 接口免 DB 读取。 */
    private final Map<Long, AtomicInteger> progressCache = new ConcurrentHashMap<>();
    /** runId -> 取消标记，由 cancel 接口设置，Runner 在每次循环中检查。 */
    private final Map<Long, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();

    public ModelBenchmarkService(ModelBenchmarkRunRepository runRepository,
                                 ModelBenchmarkMetricRepository metricRepository,
                                 AiModelConfigRepository aiModelConfigRepository,
                                 UserRepository userRepository,
                                 ModelConfigService modelConfigService,
                                 BenchmarkInvoker benchmarkInvoker,
                                 ObjectMapper objectMapper,
                                 @Qualifier("benchmarkRunExecutor") Executor benchmarkRunExecutor,
                                 @Qualifier("benchmarkWorkerExecutor") Executor benchmarkWorkerExecutor) {
        this.runRepository = runRepository;
        this.metricRepository = metricRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.userRepository = userRepository;
        this.modelConfigService = modelConfigService;
        this.benchmarkInvoker = benchmarkInvoker;
        this.objectMapper = objectMapper;
        this.benchmarkRunExecutor = benchmarkRunExecutor;
        this.benchmarkWorkerExecutor = benchmarkWorkerExecutor;
    }

    // =================== 对外 API ===================

    /**
     * 创建一次对比测试 run，并异步启动执行。
     */
    @Transactional
    public ModelBenchmarkRunDetail createAndStart(ModelBenchmarkCreateRequest request) {
        validateModels(request.modelIds());

        ModelBenchmarkRunEntity run = new ModelBenchmarkRunEntity();
        run.setName(hasText(request.name()) ? request.name().trim() : defaultRunName());
        run.setStatus("PENDING");
        run.setConcurrency(request.concurrency());
        run.setTotalRequests(request.totalRequests());
        run.setStreamEnabled(request.streamEnabled() == null ? Boolean.TRUE : request.streamEnabled());
        run.setMaxTokens(request.maxTokens() == null ? 512 : request.maxTokens());
        run.setSystemPrompt(hasText(request.systemPrompt()) ? request.systemPrompt() : DEFAULT_SYSTEM_PROMPT);
        run.setUserPrompt(hasText(request.userPrompt()) ? request.userPrompt() : DEFAULT_USER_PROMPT);
        run.setModelIds(serializeIds(request.modelIds()));
        run.setProgressTotal(request.totalRequests() * request.modelIds().size());
        run.setProgressDone(0);
        run.setCreatedBy(currentUserId());
        ModelBenchmarkRunEntity saved = runRepository.save(run);

        // 为每个模型预先写入 PENDING 指标行（snapshot 名称、provider 等，便于历史回看）
        List<ModelBenchmarkMetricEntity> metrics = new ArrayList<>();
        for (Long modelId : request.modelIds()) {
            AiModelConfigEntity model = aiModelConfigRepository.findById(modelId)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在: " + modelId));
            ModelBenchmarkMetricEntity metric = new ModelBenchmarkMetricEntity();
            metric.setRunId(saved.getId());
            metric.setModelId(model.getId());
            metric.setModelName(model.getName());
            metric.setProvider(defaultString(model.getProvider()));
            metric.setModelRealName(defaultString(model.getModelName()));
            metric.setStatus("PENDING");
            metrics.add(metric);
        }
        metricRepository.saveAll(metrics);

        // 内存进度缓存
        progressCache.put(saved.getId(), new AtomicInteger(0));
        cancelFlags.put(saved.getId(), new AtomicBoolean(false));

        // 提交编排任务：必须等当前事务真正提交后再让 Runner 读库，
        // 否则异步线程可能拿不到刚 INSERT 但未 commit 的 run / metric 行。
        Long runId = saved.getId();
        Runnable kickoff = () -> CompletableFuture.runAsync(() -> executeRun(runId), benchmarkRunExecutor)
                .exceptionally(ex -> {
                    log.error("benchmark run {} failed unexpectedly", runId, ex);
                    safeMarkFailed(runId, ex.getMessage());
                    return null;
                });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    kickoff.run();
                }
            });
        } else {
            // 没有外层事务（极端兜底），直接启动
            kickoff.run();
        }

        return getDetail(saved.getId());
    }

    public PageResponse<ModelBenchmarkRunSummary> page(int page, int size, String keyword, String status) {
        Pageable pageable = PageRequest.of(Math.max(page - 1, 0), Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "id"));
        Specification<ModelBenchmarkRunEntity> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.like(cb.lower(root.get("name")), pattern));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim().toUpperCase()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Page<ModelBenchmarkRunEntity> data = runRepository.findAll(spec, pageable);
        Map<Long, String> nicknames = loadNicknames(data.getContent().stream().map(ModelBenchmarkRunEntity::getCreatedBy).toList());
        Page<ModelBenchmarkRunSummary> mapped = data.map(entity -> toSummary(entity, nicknames));
        return PageResponse.from(mapped);
    }

    public ModelBenchmarkRunDetail getDetail(Long id) {
        ModelBenchmarkRunEntity run = requireRun(id);
        List<ModelBenchmarkMetricEntity> metrics = metricRepository.findAllByRunIdOrderByIdAsc(id);
        // 用内存进度覆盖落库快照，实时性更高（落库是节流刷新）
        AtomicInteger live = progressCache.get(id);
        Integer progressDone = live != null ? live.get() : run.getProgressDone();
        String createdByName = run.getCreatedBy() == null ? null
                : userRepository.findById(run.getCreatedBy()).map(UserEntity::getNickname).orElse(null);
        return new ModelBenchmarkRunDetail(
                run.getId(),
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
        AtomicInteger live = progressCache.get(id);
        int done = live != null ? live.get() : run.getProgressDone();
        return new ModelBenchmarkProgressView(run.getId(), run.getStatus(), run.getProgressTotal(), done, run.getErrorMessage());
    }

    @Transactional
    public void cancel(Long id) {
        ModelBenchmarkRunEntity run = requireRun(id);
        if (!"PENDING".equals(run.getStatus()) && !"RUNNING".equals(run.getStatus())) {
            return;
        }
        AtomicBoolean flag = cancelFlags.computeIfAbsent(id, k -> new AtomicBoolean(false));
        flag.set(true);

        // 立即把状态改成 CANCELED 给前端反馈；Runner 感知 flag 后会停止派发新请求，
        // 已派发的 worker 会跑完，但其结果不再影响整体状态。
        run.setStatus("CANCELED");
        run.setFinishedAt(LocalDateTime.now());
        runRepository.save(run);
    }

    @Transactional
    public void delete(Long id) {
        ModelBenchmarkRunEntity run = requireRun(id);
        if ("RUNNING".equals(run.getStatus())) {
            throw new IllegalStateException("运行中的对比测试不可删除，请先取消");
        }
        metricRepository.deleteByRunId(id);
        runRepository.delete(run);
        progressCache.remove(id);
        cancelFlags.remove(id);
    }

    /**
     * 基于已有 run 的配置克隆出一个新 run 并立即启动。
     * 旧 run 与历史指标保留，便于多次执行结果对比；新 run 名称末尾自动追加"-重跑"。
     */
    @Transactional
    public ModelBenchmarkRunDetail rerun(Long id) {
        ModelBenchmarkRunEntity source = requireRun(id);
        if ("PENDING".equals(source.getStatus()) || "RUNNING".equals(source.getStatus())) {
            throw new IllegalStateException("当前对比测试尚未结束，无法重跑");
        }
        List<Long> modelIds = deserializeIds(source.getModelIds());
        if (modelIds.isEmpty()) {
            throw new IllegalStateException("原对比测试缺少模型配置，无法重跑");
        }
        ModelBenchmarkCreateRequest cloned = new ModelBenchmarkCreateRequest(
                appendRerunSuffix(source.getName()),
                modelIds,
                source.getConcurrency(),
                source.getTotalRequests(),
                source.getStreamEnabled(),
                source.getMaxTokens(),
                source.getSystemPrompt(),
                source.getUserPrompt()
        );
        return createAndStart(cloned);
    }

    /** 给重跑生成的新 run 加上一个直观的后缀，避免和原 run 同名混淆。 */
    private String appendRerunSuffix(String original) {
        String base = hasText(original) ? original.trim() : defaultRunName();
        if (base.length() > 150) {
            base = base.substring(0, 150);
        }
        return base + "-重跑";
    }

    // =================== 异步执行 ===================

    /**
     * 整个 run 的编排入口。逐模型串行执行，避免不同模型并发互相干扰指标。
     */
    void executeRun(Long runId) {
        ModelBenchmarkRunEntity run;
        try {
            run = runRepository.findById(runId).orElse(null);
        } catch (RuntimeException ex) {
            log.error("failed to load benchmark run {}", runId, ex);
            return;
        }
        if (run == null) {
            return;
        }

        // 切到 RUNNING
        run.setStatus("RUNNING");
        runRepository.save(run);

        AtomicBoolean cancelFlag = cancelFlags.computeIfAbsent(runId, k -> new AtomicBoolean(false));
        AtomicInteger doneCounter = progressCache.computeIfAbsent(runId, k -> new AtomicInteger(0));

        boolean anyFailedHard = false;

        List<Long> modelIds = deserializeIds(run.getModelIds());
        for (Long modelId : modelIds) {
            if (cancelFlag.get()) {
                break;
            }

            ModelBenchmarkMetricEntity metric = findMetric(runId, modelId);
            if (metric == null) {
                continue;
            }

            try {
                ResolvedModelConfig config = modelConfigService.resolveModelConfig(modelId);
                metric.setStatus("RUNNING");
                metricRepository.save(metric);

                ModelRunResult result = runForModel(config, run, cancelFlag, doneCounter, runId);

                ModelBenchmarkMetrics.aggregate(metric, result.results, result.wallTimeMs);
                metric.setStatus(cancelFlag.get() && metric.getTotalCount() < run.getTotalRequests()
                        ? "SKIPPED" : "SUCCESS");
                metricRepository.save(metric);
            } catch (RuntimeException ex) {
                log.warn("benchmark run {} model {} failed: {}", runId, modelId, ex.getMessage());
                anyFailedHard = true;
                metric.setStatus("FAILED");
                metric.setSampleError(trim(ex.getMessage(), 500));
                metricRepository.save(metric);
            }

            // 每个模型完成后强制刷一次进度落库，便于历史详情页快速看到正确状态
            flushProgress(runId, doneCounter);
        }

        ModelBenchmarkRunEntity finalRun = runRepository.findById(runId).orElse(null);
        if (finalRun != null) {
            finalRun.setProgressDone(doneCounter.get());
            // 如果用户已经 cancel，状态保持 CANCELED；否则按本次执行结果决定
            boolean alreadyCanceled = "CANCELED".equals(finalRun.getStatus());
            if (finalRun.getFinishedAt() == null) {
                finalRun.setFinishedAt(LocalDateTime.now());
            }
            if (cancelFlag.get() || alreadyCanceled) {
                finalRun.setStatus("CANCELED");
            } else if (anyFailedHard && finalRun.getProgressDone() == 0) {
                finalRun.setStatus("FAILED");
                if (!hasText(finalRun.getErrorMessage())) {
                    finalRun.setErrorMessage("所有模型执行失败");
                }
            } else {
                finalRun.setStatus("SUCCESS");
            }
            runRepository.save(finalRun);
        }
    }

    /**
     * 单个模型的并发压测。返回原始结果集合 + 墙钟耗时（用于计算 token/s 与吞吐）。
     */
    private ModelRunResult runForModel(ResolvedModelConfig config,
                                       ModelBenchmarkRunEntity run,
                                       AtomicBoolean cancelFlag,
                                       AtomicInteger doneCounter,
                                       Long runId) {
        int total = run.getTotalRequests();
        int concurrency = Math.max(1, Math.min(run.getConcurrency(), total));
        boolean stream = Boolean.TRUE.equals(run.getStreamEnabled());
        int maxTokens = run.getMaxTokens() == null ? 512 : run.getMaxTokens();
        String systemPrompt = run.getSystemPrompt();
        String userPrompt = run.getUserPrompt();

        Semaphore semaphore = new Semaphore(concurrency);
        ConcurrentLinkedQueue<BenchmarkInvocationResult> results = new ConcurrentLinkedQueue<>();
        List<CompletableFuture<Void>> futures = new ArrayList<>(total);

        long modelStartNs = System.nanoTime();
        for (int i = 0; i < total; i++) {
            if (cancelFlag.get()) {
                break;
            }
            try {
                semaphore.acquire();
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                try {
                    if (cancelFlag.get()) {
                        return;
                    }
                    BenchmarkInvocationResult r = benchmarkInvoker.invoke(config, systemPrompt, userPrompt, maxTokens, stream);
                    results.offer(r);
                } finally {
                    semaphore.release();
                    int done = doneCounter.incrementAndGet();
                    maybeFlushProgress(runId, done, doneCounter);
                }
            }, benchmarkWorkerExecutor);
            futures.add(future);
        }

        // 等待所有已派发的任务完成
        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
        } catch (RuntimeException ignore) {
            // 单个任务的异常已经在 invoker 内部转换为 failure 结果
        }
        long modelWallMs = Math.max(0L, (System.nanoTime() - modelStartNs) / 1_000_000L);

        ModelRunResult ret = new ModelRunResult();
        ret.results = new ArrayList<>(results);
        ret.wallTimeMs = modelWallMs;
        return ret;
    }

    // =================== 内部工具 ===================

    private void maybeFlushProgress(Long runId, int done, AtomicInteger counter) {
        if (done % PROGRESS_FLUSH_BATCH != 0) {
            return;
        }
        // 简单粗粒度防热写：以 PROGRESS_FLUSH_BATCH 为间隔做落库
        flushProgress(runId, counter);
    }

    private void flushProgress(Long runId, AtomicInteger counter) {
        try {
            runRepository.findById(runId).ifPresent(entity -> {
                entity.setProgressDone(counter.get());
                runRepository.save(entity);
            });
        } catch (RuntimeException ex) {
            // 进度刷新失败不影响主流程，只记录日志
            log.debug("flush benchmark progress for run {} failed: {}", runId, ex.getMessage());
        }
    }

    private void safeMarkFailed(Long runId, String message) {
        try {
            runRepository.findById(runId).ifPresent(entity -> {
                if (!"SUCCESS".equals(entity.getStatus()) && !"CANCELED".equals(entity.getStatus())) {
                    entity.setStatus("FAILED");
                    entity.setErrorMessage(trim(message, 500));
                    entity.setFinishedAt(LocalDateTime.now());
                    runRepository.save(entity);
                }
            });
        } catch (RuntimeException ignore) {
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

    private ModelBenchmarkMetricEntity findMetric(Long runId, Long modelId) {
        return metricRepository.findAllByRunIdOrderByIdAsc(runId).stream()
                .filter(m -> modelId.equals(m.getModelId()))
                .findFirst()
                .orElse(null);
    }

    private ModelBenchmarkRunSummary toSummary(ModelBenchmarkRunEntity entity, Map<Long, String> nicknames) {
        List<Long> ids = deserializeIds(entity.getModelIds());
        return new ModelBenchmarkRunSummary(
                entity.getId(),
                entity.getName(),
                entity.getStatus(),
                entity.getConcurrency(),
                entity.getTotalRequests(),
                entity.getStreamEnabled(),
                entity.getMaxTokens(),
                ids.size(),
                ids,
                entity.getProgressTotal(),
                entity.getProgressDone(),
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

    private Long currentUserId() {
        return AuthContextHolder.get().map(AuthContext::userId).orElse(null);
    }

    private String defaultRunName() {
        return "对比测试-" + LocalDateTime.now().withNano(0);
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

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** 私有载体，避免对外暴露不必要类型。 */
    private static final class ModelRunResult {
        List<BenchmarkInvocationResult> results = List.of();
        long wallTimeMs;
    }

    // 仅供同包测试用：暴露内存进度缓存当前值
    Optional<Integer> peekProgress(Long runId) {
        AtomicInteger c = progressCache.get(runId);
        return c == null ? Optional.empty() : Optional.of(c.get());
    }
}
