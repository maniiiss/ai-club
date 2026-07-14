package com.aiclub.platform.service;

import com.aiclub.platform.runtime.RuntimeAdapter;
import com.aiclub.platform.runtime.RuntimeCapability;
import com.aiclub.platform.runtime.RuntimeChatResult;
import com.aiclub.platform.runtime.RuntimeInvocationContext;
import com.aiclub.platform.dto.RuntimeChatOptionSummary;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.List;
import java.util.Set;

/**
 * GitPilot 聊天 Runtime 路由服务。
 * 业务意图：统一校验 Runtime 注册状态和 CHAT 能力，避免 Hermes 会话、聊天室各自散落路由规则。
 */
@Service
public class RuntimeChatService {

    public static final String HERMES_LEGACY = "HERMES_LEGACY";

    private final RuntimeRegistryService runtimeRegistryService;
    private final RuntimeAdapterRegistry runtimeAdapterRegistry;

    public RuntimeChatService(RuntimeRegistryService runtimeRegistryService,
                               RuntimeAdapterRegistry runtimeAdapterRegistry) {
        this.runtimeRegistryService = runtimeRegistryService;
        this.runtimeAdapterRegistry = runtimeAdapterRegistry;
    }

    /** 判断是否应该继续走历史 Hermes Gateway 兼容链路。 */
    public boolean isLegacy(String runtimeCode) {
        return HERMES_LEGACY.equals(normalize(runtimeCode));
    }

    /**
     * 调用非 Legacy Runtime 的同步聊天入口。
     * Legacy 由原有 HermesGatewayService 处理，避免破坏其工具调用和 SSE 兼容协议。
     */
    public RuntimeChatResult chat(String runtimeCode, RuntimeInvocationContext context) {
        String normalized = normalize(runtimeCode);
        if (isLegacy(normalized)) {
            throw new IllegalArgumentException("HERMES_LEGACY 必须通过 Hermes Gateway 调用");
        }
        if (!runtimeRegistryService.isAvailable(normalized, Set.of(RuntimeCapability.CHAT))) {
            throw new IllegalStateException("Runtime 当前不可用于聊天：" + normalized);
        }
        RuntimeAdapter adapter = runtimeAdapterRegistry.require(normalized);
        return adapter.chat(context);
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
