package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/**
 * 工具查询返回的候选对象，用于 Assistant 抽屉展示和后续动作确认。
 */
public record PlatformToolCandidate(
        String type,
        Long id,
        String title,
        String subtitle,
        String route,
        Map<String, Object> payload,
        List<PlatformToolAction> actions
) {
}
