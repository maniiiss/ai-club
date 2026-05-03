package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.dto.request.ProjectGiteeBindingRequest;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class GiteeControllerPermissionTests {

    @Test
    void shouldUseDedicatedPermissionsForBindingAndSyncEndpoints() throws NoSuchMethodException {
        Method listProjectPrograms = GiteeController.class.getMethod("listProjectPrograms");
        Method createProjectBinding = GiteeController.class.getMethod(
                "createProjectBinding",
                Long.class,
                com.aiclub.platform.dto.request.ProjectGiteeBindingRequest.class
        );
        Method syncIterationWorkItems = GiteeController.class.getMethod("syncIterationWorkItems", Long.class);

        assertThat(listProjectPrograms.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(listProjectPrograms.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:binding:manage");
        assertThat(createProjectBinding.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(createProjectBinding.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:binding:manage");
        assertThat(syncIterationWorkItems.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(syncIterationWorkItems.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:work-item:sync");
    }

    @Test
    void shouldExposeSimplifiedProjectBindingContract() throws NoSuchMethodException {
        assertThatCode(() -> GiteeController.class.getMethod("listProjectPrograms"))
                .doesNotThrowAnyException();
        Method listProjectPrograms = GiteeController.class.getMethod("listProjectPrograms");
        assertThat(listProjectPrograms.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(listProjectPrograms.getAnnotation(RequirePermission.class).value()).isEqualTo("gitee:binding:manage");
        assertThat(ProjectGiteeBindingRequest.class.getRecordComponents())
                .extracting(RecordComponent::getName)
                .containsExactly("giteeProgramId", "enabled");
    }
}
