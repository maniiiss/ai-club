package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class GiteeControllerPermissionTests {

    @Test
    void shouldUseDedicatedPermissionsForBindingAndSyncEndpoints() throws NoSuchMethodException {
        Method discoverPrograms = GiteeController.class.getMethod(
                "discoverProjectPrograms",
                Long.class,
                com.aiclub.platform.dto.request.GiteeProjectBindingDiscoveryRequest.class
        );
        Method createProjectBinding = GiteeController.class.getMethod(
                "createProjectBinding",
                Long.class,
                com.aiclub.platform.dto.request.ProjectGiteeBindingRequest.class
        );
        Method syncIterationWorkItems = GiteeController.class.getMethod("syncIterationWorkItems", Long.class);

        assertThat(discoverPrograms.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(discoverPrograms.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:binding:manage");
        assertThat(createProjectBinding.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(createProjectBinding.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:binding:manage");
        assertThat(syncIterationWorkItems.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(syncIterationWorkItems.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:work-item:sync");
    }
}
