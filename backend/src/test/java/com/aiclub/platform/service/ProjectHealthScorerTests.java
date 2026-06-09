package com.aiclub.platform.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectHealthScorerTests {

    private final ProjectHealthScorer scorer = new ProjectHealthScorer();

    /**
     * 可用且低延迟的实例应该得到满分健康状态。
     */
    @Test
    void shouldScoreHealthyWhenProbeIsAvailableAndLowLatency() {
        ProjectHealthScorer.HealthScoreResult result = scorer.score(true, 800L);

        assertThat(result.score()).isEqualTo(100);
        assertThat(result.level()).isEqualTo(ProjectHealthScorer.LEVEL_HEALTHY);
    }

    /**
     * 可用但高延迟的实例应降级为亚健康，便于在项目概览中尽早暴露性能退化。
     */
    @Test
    void shouldScoreDegradedWhenProbeIsAvailableButSlow() {
        ProjectHealthScorer.HealthScoreResult result = scorer.score(true, 5_000L);

        assertThat(result.score()).isEqualTo(75);
        assertThat(result.level()).isEqualTo(ProjectHealthScorer.LEVEL_DEGRADED);
    }

    /**
     * 探针不可用时直接判定为异常。
     */
    @Test
    void shouldScoreAbnormalWhenProbeIsUnavailable() {
        ProjectHealthScorer.HealthScoreResult result = scorer.score(false, 120L);

        assertThat(result.score()).isEqualTo(0);
        assertThat(result.level()).isEqualTo(ProjectHealthScorer.LEVEL_ABNORMAL);
    }

    /**
     * 项目级健康汇总需要取最差等级，避免单个异常实例被其它健康实例掩盖。
     */
    @Test
    void shouldReturnWorseLevelWhenComparingLevels() {
        assertThat(scorer.worseLevel(ProjectHealthScorer.LEVEL_HEALTHY, ProjectHealthScorer.LEVEL_ABNORMAL))
                .isEqualTo(ProjectHealthScorer.LEVEL_ABNORMAL);
        assertThat(scorer.worseLevel(ProjectHealthScorer.LEVEL_DEGRADED, ProjectHealthScorer.LEVEL_HEALTHY))
                .isEqualTo(ProjectHealthScorer.LEVEL_DEGRADED);
    }
}
