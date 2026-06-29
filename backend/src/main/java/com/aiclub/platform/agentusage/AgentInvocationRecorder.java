package com.aiclub.platform.agentusage;

import com.aiclub.platform.domain.model.AgentInvocationLogEntity;
import com.aiclub.platform.repository.AgentInvocationLogRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.function.Function;
import java.util.function.Supplier;

/**
 * 智能体调用日志记录器。
 *
 * <p>所有埋点统一通过本服务落账。核心保证：
 * <ul>
 *   <li>使用 {@code REQUIRES_NEW} 独立事务，落账失败不影响主链路。</li>
 *   <li>{@code track*} 方法自动维护 {@link AgentInvocationContextHolder}，
 *       供 {@code ModelConfigService} 底层兜底判断。</li>
 *   <li>异常仍向外重新抛出，仅吞掉日志写入本身的异常。</li>
 * </ul>
 */
@Service
public class AgentInvocationRecorder {

    private static final Logger log = LoggerFactory.getLogger(AgentInvocationRecorder.class);
    private static final int MAX_ERROR_MESSAGE_LENGTH = 1000;
    private static final int MAX_ACTION_LENGTH = 80;

    private final AgentInvocationLogRepository repository;
    private final TransactionTemplate transactionTemplate;

    public AgentInvocationRecorder(AgentInvocationLogRepository repository,
                                   PlatformTransactionManager transactionManager) {
        this.repository = repository;
        // 强制使用 REQUIRES_NEW + 非只读事务，避免被外层 @Transactional(readOnly=true) 拖垮，
        // 也避免依赖 self-invocation 触发 @Transactional 代理（CGLIB 代理对内部调用无效）。
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.transactionTemplate.setReadOnly(false);
    }

    // ---------- 公开 API：同步 supplier 包装 ----------

    /**
     * 包装一个同步调用，自动记录成功/失败/耗时。
     */
    public <T> T track(AgentInvocationContext ctx, Supplier<T> action) {
        return trackWithUsage(ctx, sink -> action.get());
    }

    /**
     * 包装一个同步调用，允许调用方通过 {@link UsageSink} 回填 token / 输出字符数。
     */
    public <T> T trackWithUsage(AgentInvocationContext ctx, Function<UsageSink, T> action) {
        UsageSink sink = new UsageSink();
        boolean ownsContext = !AgentInvocationContextHolder.isPresent();
        if (ownsContext) {
            AgentInvocationContextHolder.set(ctx);
        }
        long start = System.nanoTime();
        try {
            T result = action.apply(sink);
            persistSafely(buildRecord(ctx, sink, InvocationStatus.SUCCESS, null, durationMs(start)));
            return result;
        } catch (RuntimeException ex) {
            persistSafely(buildRecord(ctx, sink, classifyStatus(ex), ex, durationMs(start)));
            throw ex;
        } finally {
            if (ownsContext) {
                AgentInvocationContextHolder.clear();
            }
        }
    }

    // ---------- 公开 API：手动生命周期（流式/异步） ----------

    /**
     * 流式或异步调用前调用本方法注册上下文并返回 UsageSink。
     *
     * <p>调用方必须在结束时调用 {@link #commit(AgentInvocationContext, UsageSink, long)}
     * 或 {@link #fail(AgentInvocationContext, UsageSink, Throwable, long)}，否则不会落账。
     */
    public ManualHandle startManual(AgentInvocationContext ctx) {
        return new ManualHandle(ctx, new UsageSink(), System.nanoTime());
    }

    /**
     * 流式调用成功结束时调用。
     */
    public void commit(AgentInvocationContext ctx, UsageSink sink, long startNanos) {
        persistSafely(buildRecord(ctx, sink, InvocationStatus.SUCCESS, null, durationMs(startNanos)));
    }

    /**
     * 流式调用失败/客户端断开时调用。
     */
    public void fail(AgentInvocationContext ctx, UsageSink sink, Throwable ex, long startNanos) {
        persistSafely(buildRecord(ctx, sink, classifyStatus(ex), ex, durationMs(startNanos)));
    }

    /**
     * 显式以指定状态结束（如 CLIENT_DISCONNECTED）。
     */
    public void finish(AgentInvocationContext ctx, UsageSink sink, InvocationStatus status, Throwable ex, long startNanos) {
        persistSafely(buildRecord(ctx, sink, status, ex, durationMs(startNanos)));
    }

    /**
     * 直接落账一条已构造好的日志（兜底场景使用）。
     */
    public void record(AgentInvocationContext ctx, UsageSink sink, InvocationStatus status, Throwable ex, long durationMs) {
        persistSafely(buildRecord(ctx, sink, status, ex, durationMs));
    }

    // ---------- 内部：构造 & 持久化 ----------

    private AgentInvocationLogEntity buildRecord(AgentInvocationContext ctx,
                                                  UsageSink sink,
                                                  InvocationStatus status,
                                                  Throwable ex,
                                                  long durationMs) {
        AgentInvocationLogEntity entity = new AgentInvocationLogEntity();
        AuthContext authContext = resolveAuthContext(ctx);
        if (authContext != null) {
            entity.setUserId(authContext.userId());
            entity.setUsernameSnapshot(safe(authContext.username()));
            entity.setNicknameSnapshot(safe(authContext.nickname()));
        }
        entity.setAgentType(ctx.getAgentType().name());
        entity.setAction(truncate(ctx.getAction(), MAX_ACTION_LENGTH));
        entity.setProvider(ctx.getProvider());
        entity.setModelConfigId(ctx.getModelConfigId());
        entity.setModelName(ctx.getModelName());
        entity.setTriggerSource(ctx.getTriggerSource().name());
        entity.setProjectId(ctx.getProjectId());
        entity.setTaskId(ctx.getTaskId());
        entity.setBizId(ctx.getBizId());
        entity.setAgentId(ctx.getAgentId());
        entity.setAgentCode(ctx.getAgentCode());
        entity.setRequestUri(ctx.getRequestUri());
        entity.setRouteName(ctx.getRouteName());

        entity.setStatus(status.name());
        entity.setDurationMs(Math.max(0, durationMs));
        entity.setInputChars(ctx.getInputChars());

        // sink 字段
        entity.setPromptTokens(sink.getPromptTokens());
        entity.setCompletionTokens(sink.getCompletionTokens());
        entity.setTotalTokens(sink.getTotalTokens());
        entity.setOutputChars(sink.getOutputChars());
        entity.setCostCredits(sink.getCostCredits());
        // 优先用 sink 中累计的 correlationId
        entity.setCorrelationId(sink.getCorrelationId() != null ? sink.getCorrelationId() : ctx.getCorrelationId());

        if (ex != null) {
            entity.setErrorCode(classifyErrorCode(ex));
            entity.setErrorMessage(truncate(ex.getMessage(), MAX_ERROR_MESSAGE_LENGTH));
        }
        return entity;
    }

    private void persistSafely(AgentInvocationLogEntity entity) {
        try {
            transactionTemplate.executeWithoutResult(status -> repository.save(entity));
        } catch (Exception ex) {
            log.warn("智能体调用日志落账失败：agentType={}, action={}, status={}",
                    entity.getAgentType(), entity.getAction(), entity.getStatus(), ex);
        }
    }

    // ---------- 内部：辅助 ----------

    private AuthContext resolveAuthContext(AgentInvocationContext ctx) {
        if (ctx.getAuthContextSnapshot() != null) {
            return ctx.getAuthContextSnapshot();
        }
        return AuthContextHolder.get().orElse(null);
    }

    private static long durationMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000L;
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static InvocationStatus classifyStatus(Throwable ex) {
        if (ex == null) return InvocationStatus.FAILURE;
        String simpleName = ex.getClass().getSimpleName().toLowerCase();
        if (simpleName.contains("timeout")) return InvocationStatus.TIMEOUT;
        if (simpleName.contains("disconnect") || simpleName.contains("clientabort")) return InvocationStatus.CLIENT_DISCONNECTED;
        if (simpleName.contains("ratelimit") || simpleName.contains("toomany")) return InvocationStatus.RATE_LIMITED;
        return InvocationStatus.FAILURE;
    }

    private static String classifyErrorCode(Throwable ex) {
        if (ex == null) return null;
        String simpleName = ex.getClass().getSimpleName();
        if (simpleName.toLowerCase().contains("timeout")) return "TIMEOUT";
        if (simpleName.toLowerCase().contains("disconnect")) return "CLIENT_DISCONNECTED";
        if (simpleName.toLowerCase().contains("ratelimit")) return "RATE_LIMITED";
        if (simpleName.contains("HttpClientErrorException") || simpleName.contains("4xx")) return "DOWNSTREAM_4XX";
        if (simpleName.contains("HttpServerErrorException") || simpleName.contains("5xx")) return "DOWNSTREAM_5XX";
        if (simpleName.contains("IOException") || simpleName.contains("Connect")) return "IO";
        if (simpleName.contains("Parse") || simpleName.contains("Json")) return "PARSE";
        if (simpleName.contains("Illegal") || simpleName.contains("Validation")) return "VALIDATION";
        return "UNKNOWN";
    }

    /**
     * 手动模式句柄，封装 (ctx, sink, startNanos)。
     */
    public final class ManualHandle {
        private final AgentInvocationContext ctx;
        private final UsageSink sink;
        private final long startNanos;

        ManualHandle(AgentInvocationContext ctx, UsageSink sink, long startNanos) {
            this.ctx = ctx;
            this.sink = sink;
            this.startNanos = startNanos;
        }

        public UsageSink sink() { return sink; }
        public AgentInvocationContext ctx() { return ctx; }
        public long startNanos() { return startNanos; }

        public void commit() {
            AgentInvocationRecorder.this.commit(ctx, sink, startNanos);
        }

        public void fail(Throwable ex) {
            AgentInvocationRecorder.this.fail(ctx, sink, ex, startNanos);
        }

        public void finish(InvocationStatus status, Throwable ex) {
            AgentInvocationRecorder.this.finish(ctx, sink, status, ex, startNanos);
        }
    }
}