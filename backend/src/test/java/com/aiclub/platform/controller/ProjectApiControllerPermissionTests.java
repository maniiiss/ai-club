package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * API 管理需要把只读浏览和可变更操作分开，避免调试和导入误落到只读权限里。
 */
class ProjectApiControllerPermissionTests {

    @Test
    void shouldUseManagePermissionForMutationsAndDebugExecution() throws NoSuchMethodException {
        Method updateProfile = ProjectApiController.class.getMethod("updateProfile", Long.class, com.aiclub.platform.dto.request.ProjectApiProfileRequest.class);
        Method createFolder = ProjectApiController.class.getMethod("createFolder", Long.class, com.aiclub.platform.dto.request.ProjectApiFolderRequest.class);
        Method createEndpoint = ProjectApiController.class.getMethod("createEndpoint", Long.class, com.aiclub.platform.dto.request.ProjectApiEndpointRequest.class);
        Method createEnvironment = ProjectApiController.class.getMethod("createEnvironment", Long.class, com.aiclub.platform.dto.request.ProjectApiEnvironmentRequest.class);
        Method importOpenApi = ProjectApiController.class.getMethod("importOpenApi", Long.class, com.aiclub.platform.dto.request.ProjectApiImportRequest.class);
        Method executeDebug = ProjectApiController.class.getMethod("executeDebug", Long.class, Long.class, com.aiclub.platform.dto.request.ProjectApiDebugExecuteRequest.class);

        assertThat(updateProfile.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
        assertThat(createFolder.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
        assertThat(createEndpoint.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
        assertThat(createEnvironment.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
        assertThat(importOpenApi.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
        assertThat(executeDebug.getAnnotation(RequirePermission.class).value()).isEqualTo("api:manage");
    }

    @Test
    void shouldUseViewPermissionForReadEndpoints() throws NoSuchMethodException {
        Method getProfile = ProjectApiController.class.getMethod("getProfile", Long.class);
        Method getTree = ProjectApiController.class.getMethod("getTree", Long.class);
        Method getEndpoint = ProjectApiController.class.getMethod("getEndpoint", Long.class, Long.class);
        Method listEnvironments = ProjectApiController.class.getMethod("listEnvironments", Long.class);
        Method exportOpenApi = ProjectApiController.class.getMethod("exportOpenApi", Long.class, String.class);
        Method listDebugRecords = ProjectApiController.class.getMethod("listDebugRecords", Long.class, Long.class);

        assertThat(getProfile.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(getTree.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(getEndpoint.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(listEnvironments.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(exportOpenApi.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(listDebugRecords.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
    }
}
