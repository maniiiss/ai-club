package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/** 校验桌面发布管理接口使用独立权限，避免误复用平台版本说明权限。 */
class DesktopReleaseControllerPermissionTests {

    @Test
    void shouldUseDesktopReleasePermissions() throws NoSuchMethodException {
        Method list = DesktopReleaseController.class.getMethod("pageAdmin", int.class, int.class);
        Method create = DesktopReleaseController.class.getMethod("create", com.aiclub.platform.dto.request.DesktopReleaseRequest.class);
        Method publish = DesktopReleaseController.class.getMethod("publish", Long.class);
        Method revoke = DesktopReleaseController.class.getMethod("revoke", Long.class);

        assertThat(list.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:view");
        assertThat(create.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
        assertThat(publish.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
        assertThat(revoke.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
    }
}
