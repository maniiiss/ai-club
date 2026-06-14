package com.aiclub.platform.util;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class TaskStatusUtilsTests {

    @Test
    void shouldNormalizeLegacyStatusesIntoNewMainStatuses() {
        assertThat(TaskStatusUtils.normalizeStatus("任务", "草稿")).isEqualTo("待开始");
        assertThat(TaskStatusUtils.normalizeStatus("缺陷", "开发中")).isEqualTo("进行中");
        assertThat(TaskStatusUtils.normalizeStatus("需求", "完成")).isEqualTo("已完成");
        assertThat(TaskStatusUtils.normalizeStatus("需求", "阻塞")).isEqualTo("已阻塞");
    }

    @Test
    void shouldUseTypeSpecificCompletedStateDefinitions() {
        assertThat(TaskStatusUtils.isCompletedStatus("需求", "已完成")).isTrue();
        assertThat(TaskStatusUtils.isCompletedStatus("需求", "通过")).isFalse();
        assertThat(TaskStatusUtils.isCompletedStatus("任务", "已完成")).isTrue();
        assertThat(TaskStatusUtils.isCompletedStatus("缺陷", "通过")).isTrue();
        assertThat(TaskStatusUtils.isCompletedStatus("缺陷", "已完成")).isFalse();
    }

    @Test
    void shouldSkipOverdueForTypeSpecificCompletedStatuses() {
        LocalDate today = LocalDate.of(2026, 4, 30);
        LocalDate yesterday = today.minusDays(1);

        assertThat(TaskStatusUtils.isOverdue(yesterday, "需求", "已完成", today)).isFalse();
        assertThat(TaskStatusUtils.isOverdue(yesterday, "任务", "已完成", today)).isFalse();
        assertThat(TaskStatusUtils.isOverdue(yesterday, "缺陷", "通过", today)).isFalse();
        assertThat(TaskStatusUtils.isOverdue(yesterday, "缺陷", "延期解决", today)).isTrue();
    }
}
