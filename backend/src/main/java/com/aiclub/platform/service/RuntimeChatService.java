package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeAdapter;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.aiclub.platform.runtime.RuntimeChatResult;
import com.aiclub.platform.runtime.RuntimeInvocationContext;
import com.aiclub.platform.runtime.RuntimeStreamEvent;
import com.aiclub.platform.runtime.RuntimeStreamContentAssembler;
import com.aiclub.platform.runtime.RuntimeToolContext;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.RuntimeChatOptionSummary;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Locale;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

/**
 * GitPilot 聊天 Runtime 路由服务。
 * 业务意图：统一校验 Runtime 注册状态和 CHAT 能力，避免 Assistant 会话、聊天室各自散落路由规则。
 */
@Service
public class RuntimeChatService {

    public static final String HERMES_LEGACY = "HERMES_LEGACY";

    private final RuntimeRegistryService runtimeRegistryService;
    private final RuntimeAdapterRegistry runtimeAdapterRegistry;
    private final RuntimeToolContractService runtimeToolContractService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private AssistantConversationContextMetrics contextMetrics;

    public RuntimeChatService(RuntimeRegistryService runtimeRegistryService,
                               RuntimeAdapterRegistry runtimeAdapterRegistry,
                               RuntimeToolContractService runtimeToolContractService) {
        this.runtimeRegistryService = runtimeRegistryService;
        this.runtimeAdapterRegistry = runtimeAdapterRegistry;
        this.runtimeToolContractService = runtimeToolContractService;
    }

    /** 判断是否应该继续走历史 Assistant Gateway 兼容链路。 */
    public boolean isLegacy(String runtimeCode) {
        return HERMES_LEGACY.equals(normalize(runtimeCode));
    }

    /**
     * 查询当前聊天 Runtime 是否声明某项能力。
     * 业务意图：上下文编排必须先尊重 Runtime 原生压缩，再决定是否由 backend 兜底，不能只看管理员选择的策略名称。
     */
    public boolean supportsCapability(String runtimeCode, RuntimeCapability capability) {
        String normalized = normalize(runtimeCode);
        if (isLegacy(normalized) || capability == null) {
            return false;
        }
        try {
            return runtimeRegistryService.descriptor(normalized).supports(capability);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    /**
     * 调用非 Legacy Runtime 的同步聊天入口。
     * Legacy 由原有 AssistantGatewayService 处理，避免破坏其工具调用和 SSE 兼容协议。
     */
    public RuntimeChatResult chat(String runtimeCode, RuntimeInvocationContext context) {
        String normalized = normalize(runtimeCode);
        if (isLegacy(normalized)) {
            throw new IllegalArgumentException("HERMES_LEGACY 必须通过 Assistant Gateway 调用");
        }
        if (!runtimeRegistryService.isAvailable(normalized, Set.of(RuntimeCapability.CHAT))) {
            throw new IllegalStateException("Runtime 当前不可用于聊天：" + normalized);
        }
        RuntimeAdapter adapter = runtimeAdapterRegistry.require(normalized);
        return adapter.chat(context);
    }

    /**
     * 调用非 Legacy Runtime 的实时聊天入口。
     * 业务意图：Assistant 会话和聊天室只消费统一事件，具体 Runtime 的 HTTP、Gateway 或 SDK 差异由适配器隔离。
     */
    public RuntimeChatResult streamChat(String runtimeCode,
                                        RuntimeInvocationContext context,
                                        Consumer<RuntimeStreamEvent> eventConsumer) {
        String normalized = normalize(runtimeCode);
        if (isLegacy(normalized)) {
            throw new IllegalArgumentException("HERMES_LEGACY 必须通过 Assistant Gateway 调用");
        }
        if (!runtimeRegistryService.isAvailable(normalized, Set.of(RuntimeCapability.CHAT))) {
            throw new IllegalStateException("Runtime 当前不可用于聊天：" + normalized);
        }
        RuntimeAdapter adapter = runtimeAdapterRegistry.require(normalized);
        RuntimeStreamContentAssembler assembler = new RuntimeStreamContentAssembler();
        StringBuilder streamedContent = new StringBuilder();
        RuntimeChatResult result = adapter.streamChat(context, event -> {
            if (event != null && event.is("CONTEXT_COMPACTED") && contextMetrics != null) {
                contextMetrics.recordNativeCompaction(normalized);
            }
            String displayDelta = assembler.accept(event);
            if (displayDelta.isEmpty()) {
                return;
            }
            streamedContent.append(displayDelta);
            if (eventConsumer != null) {
                eventConsumer.accept(new RuntimeStreamEvent(
                        event.runId(), event.sessionId(), event.sequence(), "TEXT_DELTA",
                        java.util.Map.of("delta", displayDelta)));
            }
        });
        String closingDelta = assembler.finish();
        if (!closingDelta.isEmpty()) {
            streamedContent.append(closingDelta);
            if (eventConsumer != null) {
                eventConsumer.accept(new RuntimeStreamEvent(
                        result == null ? context.runId() : result.runId(),
                        result == null ? context.sessionId() : result.sessionId(),
                        0, "TEXT_DELTA", java.util.Map.of("delta", closingDelta)));
            }
        }
        if (result == null) {
            return new RuntimeChatResult(context.runId(), context.sessionId(), streamedContent.toString(),
                    com.aiclub.platform.runtime.RuntimeHealthStatus.HEALTHY);
        }
        String content = streamedContent.length() > 0 ? streamedContent.toString() : result.content();
        return new RuntimeChatResult(result.runId(), result.sessionId(), content, result.status());
    }

    /**
     * 为所有非 Legacy Runtime 注入统一工具契约。
     * 业务意图：业务服务只提供当前用户和房间策略，Runtime 适配器不再各自拼装工具字段。
     */
    public RuntimeInvocationContext withToolContract(RuntimeInvocationContext context,
                                                      CurrentUserInfo currentUser,
                                                      String sessionToken,
                                                      Collection<String> restrictedToolCodes,
                                                      Collection<String> autoExecuteToolCodes) {
        if (context == null || runtimeToolContractService == null) {
            return context;
        }
        RuntimeToolContext toolContext = runtimeToolContractService.forUser(
                currentUser, sessionToken, restrictedToolCodes, autoExecuteToolCodes);
        return context.withToolContext(toolContext);
    }

    /** 校验聊天室或会话配置引用了已注册且具备 CHAT 能力的 Runtime。 */
    public void validateChatRuntime(String runtimeCode) {
        String normalized = normalize(runtimeCode);
        if (isLegacy(normalized)) {
            return;
        }
        if (!runtimeRegistryService.descriptor(normalized).supports(RuntimeCapability.CHAT)) {
            throw new IllegalArgumentException("Runtime 不支持聊天能力：" + normalized);
        }
    }

    /** 返回聊天室配置可以选择的已启用聊天 Runtime，状态信息用于前端展示诊断结果。 */
    public List<RuntimeChatOptionSummary> listChatOptions() {
        return runtimeRegistryService.list().stream()
                .filter(item -> item.enabled() && item.capabilities().stream().anyMatch("CHAT"::equalsIgnoreCase))
                .map(item -> new RuntimeChatOptionSummary(item.runtimeCode(), item.version(), item.capabilities(),
                        item.healthStatus(), item.healthMessage(), item.enabled()))
                .toList();
    }

    private String normalize(String runtimeCode) {
        return runtimeCode == null || runtimeCode.isBlank()
                ? HERMES_LEGACY
                : runtimeCode.trim().toUpperCase(Locale.ROOT);
    }
}
