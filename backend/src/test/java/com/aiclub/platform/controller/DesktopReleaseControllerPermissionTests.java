package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.dto.DesktopReleaseLatest;
import com.aiclub.platform.service.DesktopReleaseService;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** 校验桌面发布管理接口使用独立权限，避免误复用平台版本说明权限。 */
@ExtendWith(MockitoExtension.class)
class DesktopReleaseControllerPermissionTests {

    @Mock
    private DesktopReleaseService releaseService;

    @Test
    void shouldUseDesktopReleasePermissions() throws NoSuchMethodException {
        Method list = DesktopReleaseController.class.getMethod("pageAdmin", int.class, int.class);
        Method create = DesktopReleaseController.class.getMethod("create", com.aiclub.platform.dto.request.DesktopReleaseRequest.class);
        Method publish = DesktopReleaseController.class.getMethod("publish", Long.class);
        Method revoke = DesktopReleaseController.class.getMethod("revoke", Long.class);
        Method delete = DesktopReleaseController.class.getMethod("delete", Long.class);

        assertThat(list.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:view");
        assertThat(create.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
        assertThat(publish.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
        assertThat(revoke.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
        assertThat(delete.getAnnotation(RequirePermission.class).value()).isEqualTo("system:desktop-release:manage");
    }

    @Test
    void shouldNotCacheEmptyPublicReleaseResult() {
        when(releaseService.latest("stable", "windows", "x86_64")).thenReturn(Optional.empty());

        DesktopReleaseController controller = new DesktopReleaseController(releaseService);
        var response = controller.latest("stable", "windows", "x86_64");

        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
    }

    @Test
    void shouldCachePublishedPublicReleaseBriefly() {
        when(releaseService.latest("stable", "windows", "x86_64")).thenReturn(Optional.of(
                new DesktopReleaseLatest("0.0.1", "stable", "GitPilot Desktop 0.0.1", "", null, java.util.List.of())));

        DesktopReleaseController controller = new DesktopReleaseController(releaseService);
        var response = controller.latest("stable", "windows", "x86_64");

        assertThat(response.getHeaders().getCacheControl()).contains("max-age=300").contains("public");
    }
}
