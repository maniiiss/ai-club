package com.aiclub.platform.agentusage;

import java.util.Optional;

/**
 * 当前线程是否已经进入 {@link AgentInvocationRecorder} 的 track 区间。
 *
 * <p>仅供 {@code ModelConfigService} 底层兜底判断使用：
 * 若线程已有显式埋点上下文，模型调用不再重复落账；
 * 若线程没有显式埋点上下文（漏埋点场景），自动以 {@link AgentType#UNKNOWN_MODEL_CALL} 兜底记录。
 */
public final class AgentInvocationContextHolder {

    private static final ThreadLocal<AgentInvocationContext> HOLDER = new ThreadLocal<>();

    private AgentInvocationContextHolder() {
    }

    public static void set(AgentInvocationContext ctx) {
        HOLDER.set(ctx);
    }

    public static Optional<AgentInvocationContext> get() {
        return Optional.ofNullable(HOLDER.get());
    }

    public static boolean isPresent() {
        return HOLDER.get() != null;
    }

    public static void clear() {
        HOLDER.remove();
    }
}