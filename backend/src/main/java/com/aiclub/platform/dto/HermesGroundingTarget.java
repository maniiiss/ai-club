package com.aiclub.platform.dto;

import java.util.Map;

/**
 * 会话中某个已绑定对象的最小快照。
 * 该快照会写入 Redis，供后续“这个需求”“刚才那个计划”一类指代恢复使用。
 */
public record HermesGroundingTarget(
        String slot,
        String entityType,
        Long entityId,
        String title,
        String route,
        Long projectId,
        String source,
        Map<String, Object> payload
) {
}
