package com.aiclub.platform.runtime;

import java.util.Map;

/**
 * Runtime 统一适配器契约。
 * 适配器只负责调用模型/状态机，平台权限、工具确认、审计和业务事实仍由 backend 裁决。
 */
public interface RuntimeAdapter {

    RuntimeDescriptor descriptor();

    RuntimeHealth healthCheck();

    default boolean supports(RuntimeCapability capability) {
        return descriptor().supports(capability);
    }

    /** 启动一次新的 Runtime 运行；具体 Adapter 可按调用形态覆盖。 */
    default RuntimeRunHandle start(RuntimeInvocationContext context) {
        throw new UnsupportedOperationException("Runtime does not support stateful start: " + descriptor().runtimeCode());
    }

    /** 恢复已有会话；不支持会话的 CLI/HTTP Runtime 保持默认拒绝。 */
    default RuntimeRunHandle resume(RuntimeInvocationContext context) {
        throw new UnsupportedOperationException("Runtime does not support session resume: " + descriptor().runtimeCode());
    }

    /** 取消运行；实现必须保持幂等。 */
    default void cancel(String runId, Map<String, Object> metadata) {
        throw new UnsupportedOperationException("Runtime does not support cancellation: " + descriptor().runtimeCode());
    }

    /** 同步调用入口，供兼容 AgentExecutionService 逐步迁移。 */
    default String invoke(RuntimeInvocationContext context) {
        throw new UnsupportedOperationException("Runtime does not support synchronous invoke: " + descriptor().runtimeCode());
    }

    /**
     * 同步聊天入口，供 GitPilot 会话和聊天室复用统一 Runtime 路由。
     * 旧 Hermes Legacy 由兼容服务直接调用，不经过该方法。
     */
    default RuntimeChatResult chat(RuntimeInvocationContext context) {
        throw new UnsupportedOperationException("Runtime does not support synchronous chat: " + descriptor().runtimeCode());
    }
}
