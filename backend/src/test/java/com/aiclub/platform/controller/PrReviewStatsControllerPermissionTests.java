package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PR 评审统计属于系统管理只读菜单，查询与配置接口都应归到统一查看权限。
 */
class PrReviewStatsControllerPermissionTests {

    @Test
    void shouldUseViewPermissionForAllEndpoints() throws NoSuchMethodException {
        Method config = PrReviewStatsController.class.getMethod("config", String.class, String.class);
        Method groups = PrReviewStatsController.class.getMethod("groups", String.class, String.class);
        Method query = PrReviewStatsController.class.getMethod("query", com.aiclub.platform.dto.request.PrReviewStatsQueryRequest.class);

        assertThat(config.getAnnotation(RequirePermission.class).value()).isEqualTo("system:pr-review:view");
        assertThat(groups.getAnnotation(RequirePermission.class).value()).isEqualTo("system:pr-review:view");
        assertThat(query.getAnnotation(RequirePermission.class).value()).isEqualTo("system:pr-review:view");
    }
}
