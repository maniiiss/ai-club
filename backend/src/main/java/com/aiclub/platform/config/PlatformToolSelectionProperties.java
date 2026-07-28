package com.aiclub.platform.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * GitPilot 按需下发工具配置。
 *
 * <p>业务意图：控制平台 MCP 工具按用户本轮意图动态筛选下发，
 * 避免一次性把全部工具（24 个）下发给模型超过其有效阈值。
 * 实测 Ark deepseek-v4-flash 在 24 个工具时思考流会在第一个词就异常结束、不产出正文，
 * 12 个及以下工具则正常，因此默认上限设为 12。
 */
@Component
public class PlatformToolSelectionProperties {

    private final boolean enabled;
    private final int maxTools;
    private final boolean vectorFallbackEnabled;
    private final List<String> coreFallbackToolCodes;

    public PlatformToolSelectionProperties(
            @Value("${platform.assistant.tool-selection.enabled:true}") boolean enabled,
            @Value("${platform.assistant.tool-selection.max-tools:12}") int maxTools,
            @Value("${platform.assistant.tool-selection.vector-fallback-enabled:true}") boolean vectorFallbackEnabled,
            @Value("${platform.assistant.tool-selection.core-fallback-codes:"
                    + "project.search,project.get_detail,work_item.search,work_item.get_detail,"
                    + "agent.list_available,wiki_space.search,user.list_project_members,document.convert_markdown}")
            List<String> coreFallbackToolCodes) {
        this.enabled = enabled;
        this.maxTools = Math.max(1, maxTools);
        this.vectorFallbackEnabled = vectorFallbackEnabled;
        this.coreFallbackToolCodes = coreFallbackToolCodes == null ? List.of() : coreFallbackToolCodes;
    }

    /** 是否启用按需下发；关闭时调用方回退到全量下发。 */
    public boolean isEnabled() {
        return enabled;
    }

    /** 单轮下发工具数量上限，超出按相关性裁剪。 */
    public int maxTools() {
        return maxTools;
    }

    /** 是否在规则未命中时启用向量检索兜底；embedding 未配置时自动降级为 false。 */
    public boolean isVectorFallbackEnabled() {
        return vectorFallbackEnabled;
    }

    /** 按需筛选完全未命中时下发的核心工具集，保证基础能力可用。 */
    public List<String> coreFallbackToolCodes() {
        return coreFallbackToolCodes;
    }
}
