package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 可观测性中心需要把只读查看与配置维护权限拆开，避免日志查看和实例配置编辑被混成一个权限。
 */
class ObservabilityControllerPermissionTests {

    @Test
    void shouldUseDedicatedPermissionsForObservabilityEndpoints() throws NoSuchMethodException {
        Method pageProjects = ObservabilityController.class.getMethod("pageProjects", int.class, int.class, String.class, String.class);
        Method getProjectDetail = ObservabilityController.class.getMethod("getProjectDetail", Long.class);
        Method pageProjectLogs = ObservabilityController.class.getMethod("pageProjectLogs", Long.class, int.class, int.class, Long.class, String.class, String.class, String.class, String.class, String.class);
        Method getProjectHealth = ObservabilityController.class.getMethod("getProjectHealth", Long.class);
        Method getProjectHealthTimeline = ObservabilityController.class.getMethod("getProjectHealthTimeline", Long.class, Long.class, int.class);
        Method updateRuntimeInstance = ObservabilityController.class.getMethod("updateRuntimeInstance", Long.class, Long.class, com.aiclub.platform.dto.request.ObservabilityRuntimeInstanceUpdateRequest.class);

        assertThat(pageProjects.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:view");
        assertThat(getProjectDetail.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:view");
        assertThat(pageProjectLogs.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:view");
        assertThat(getProjectHealth.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:view");
        assertThat(getProjectHealthTimeline.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:view");
        assertThat(updateRuntimeInstance.getAnnotation(RequirePermission.class).value()).isEqualTo("observability:manage");
    }
}
