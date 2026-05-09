package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformEnvVarControllerPermissionTests {

    @Test
    void shouldUseDedicatedPermissionsForEnvVarManagementEndpoints() throws NoSuchMethodException {
        Method list = PlatformEnvVarController.class.getMethod("list");
        Method detail = PlatformEnvVarController.class.getMethod("detail", String.class);
        Method update = PlatformEnvVarController.class.getMethod(
                "update",
                String.class,
                com.aiclub.platform.dto.request.PlatformEnvVarUpdateRequest.class
        );

        assertThat(list.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(list.getAnnotation(RequirePermission.class).value()).isEqualTo("system:env:view");
        assertThat(detail.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(detail.getAnnotation(RequirePermission.class).value()).isEqualTo("system:env:view");
        assertThat(update.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(update.getAnnotation(RequirePermission.class).value()).isEqualTo("system:env:manage");
    }
}
