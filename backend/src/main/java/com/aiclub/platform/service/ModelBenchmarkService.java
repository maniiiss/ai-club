package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkMetricEntity;
import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import com.aiclub.platform.dto.request.ModelBenchmarkConfigCreateRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.ModelBenchmarkMetricRepository;
import com.aiclub.platform.repository.ModelBenchmarkRunRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.ModelConfigService.ResolvedModelConfig;
import com.aiclub.platform.service.benchmark.BenchmarkInvocationResult;
import com.aiclub.platform.service.benchmark.BenchmarkInvoker;
import com.aiclub.platform.service.benchmark.ModelBenchmarkMetrics;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayList;
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
 * 模型对比测试执行编排服务（内部协作组件）。
 *
 * <p>本服务只承担"一次 run 的实际跑动"：写入 run + metric 行、提交异步任务、
 * 维护内存进度计数与取消 flag。配置 CRUD 由 {@link ModelBenchmarkConfigService}
 * 处理，运行记录的查询、取消、删除由 {@link ModelBenchmarkRunService} 提供给 controller。</p>
 *
 * <p>切分后本类不再被任何 controller 直接调用，因此对外 API 收口在两个上层 service。</p>
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

    private final ModelBenchmarkRunRepository runRepository;
    private final ModelBenchmarkMetricRepository metricRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
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
                                 ModelConfigService modelConfigService,
                                 BenchmarkInvoker benchmarkInvoker,
                                 ObjectMapper objectMapper,
                                 @Qualifier("benchmarkRunExecutor") Executor benchmarkRunExecutor,
                                 @Qualifier("benchmarkWorkerExecutor") Executor benchmarkWorkerExecutor) {
        this.runRepository = runRepository;
        this.metricRepository = metricRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.modelConfigService = modelConfigService;
        this.benchmarkInvoker = benchmarkInvoker;
        this.objectMapper = objectMapper;
        this.benchmarkRunExecutor = benchmarkRunExecutor;
        this.benchmarkWorkerExecutor = benchmarkWorkerExecutor;
    }

    // =================== 对内编排 API ===================

    /**
     * 基于一份配置触发一次 run，并异步启动执行。
     *
     * @param request  触发瞬间的配置快照（来自 config 字段拷贝），运行结束后不再变化
     * @param configId 关联配置 id；新模型下 run 必须挂在 config 之下
     * @return 新生成的 run id
     */
    @Transactional
    public Long createAndStart(ModelBenchmarkConfigCreateRequest request, Long configId) {
        if (configId == null) {
            throw new IllegalArgumentException("触发对比测试运行必须关联 configId");
        }
        validateModels(request.modelIds());

        ModelBenchmarkRunEntity run = new ModelBenchmarkRunEntity();
        run.setConfigId(configId);
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

        return saved.getId();
    }

    /**
     * 取消 run：设置内存 flag，并立即把状态改为 CANCELED 以反馈给前端。
     * 已派发的 worker 会跑完，但其结果不再影响整体状态。
     */
    @Transactional
    public void cancel(Long runId) {
        ModelBenchmarkRunEntity run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("对比测试不存在: " + runId));
        if (!"PENDING".equals(run.getStatus()) && !"RUNNING".equals(run.getStatus())) {
            return;
        }
        AtomicBoolean flag = cancelFlags.computeIfAbsent(runId, k -> new AtomicBoolean(false));
        flag.set(true);

        run.setStatus("CANCELED");
        run.setFinishedAt(LocalDateTime.now());
        runRepository.save(run);
    }

    /** 删除 run + 其全部 metric。运行中的 run 拒绝删除。 */
    @Transactional
    public void delete(Long runId) {
        ModelBenchmarkRunEntity run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("对比测试不存在: " + runId));
        if ("RUNNING".equals(run.getStatus())) {
            throw new IllegalStateException("运行中的对比测试不可删除，请先取消");
        }
        metricRepository.deleteByRunId(runId);
        runRepository.delete(run);
        progressCache.remove(runId);
        cancelFlags.remove(runId);
    }

    /** 不抛异常版的内存进度读取，供 RunService 拼装 detail 时实时覆盖落库快照。 */
    public Optional<Integer> peekLiveProgress(Long runId) {
        AtomicInteger c = progressCache.get(runId);
        return c == null ? Optional.empty() : Optional.of(c.get());
    }

    // =================== 异步执行 ===================

    /** 整个 run 的编排入口。逐模型串行执行，避免不同模型并发互相干扰指标。 */
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

    /** 单个模型的并发压测。返回原始结果集合 + 墙钟耗时（用于计算 token/s 与吞吐）。 */
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
        return peekLiveProgress(runId);
    }
}
