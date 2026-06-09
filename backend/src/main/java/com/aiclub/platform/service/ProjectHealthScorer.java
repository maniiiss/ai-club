package com.aiclub.platform.service;

import org.springframework.stereotype.Component;

/**
 * 项目健康评分器。
 * 第一版只按可用性与接口耗时打分，后续如引入错误率或依赖状态可继续扩展。
 */
@Component
public class ProjectHealthScorer {

    public static final String LEVEL_HEALTHY = "HEALTHY";
    public static final String LEVEL_DEGRADED = "DEGRADED";
    public static final String LEVEL_ABNORMAL = "ABNORMAL";
    public static final String LEVEL_UNKNOWN = "UNKNOWN";

    /**
     * 按当前探针结果计算健康得分与等级。
     */
    public HealthScoreResult score(boolean available, Long latencyMs) {
        int score;
        if (!available) {
            score = 0;
        } else if (latencyMs == null) {
            score = 100;
        } else if (latencyMs <= 1_000L) {
            score = 100;
        } else if (latencyMs <= 3_000L) {
            score = 90;
        } else if (latencyMs <= 5_000L) {
            score = 75;
        } else {
            score = 60;
        }
        return new HealthScoreResult(score, resolveLevel(score));
    }

    /**
     * 根据分值映射健康等级。
     */
    public String resolveLevel(Integer score) {
        if (score == null) {
            return LEVEL_UNKNOWN;
        }
        if (score >= 80) {
            return LEVEL_HEALTHY;
        }
        if (score >= 60) {
            return LEVEL_DEGRADED;
        }
        return LEVEL_ABNORMAL;
    }

    /**
     * 比较两个健康等级，返回更差的那一个。
     */
    public String worseLevel(String left, String right) {
        return levelRank(left) >= levelRank(right) ? normalizeLevel(left) : normalizeLevel(right);
    }

    private int levelRank(String level) {
        return switch (normalizeLevel(level)) {
            case LEVEL_ABNORMAL -> 3;
            case LEVEL_DEGRADED -> 2;
            case LEVEL_HEALTHY -> 1;
            default -> 0;
        };
    }

    private String normalizeLevel(String level) {
        if (level == null || level.isBlank()) {
            return LEVEL_UNKNOWN;
        }
        return switch (level.trim().toUpperCase()) {
            case LEVEL_HEALTHY -> LEVEL_HEALTHY;
            case LEVEL_DEGRADED -> LEVEL_DEGRADED;
            case LEVEL_ABNORMAL -> LEVEL_ABNORMAL;
            default -> LEVEL_UNKNOWN;
        };
    }

    /**
     * 单次健康评分结果。
     */
    public record HealthScoreResult(
            int score,
            String level
    ) {
    }
}
