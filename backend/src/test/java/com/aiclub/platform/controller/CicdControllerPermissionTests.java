package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CI/CD 控制器的触发类接口需要与配置维护权限拆分，
 * 避免“能维护配置”和“能发起构建”被强绑定。
 */
class CicdControllerPermissionTests {

    @Test
    void shouldUseDedicatedBuildPermissionForTriggerEndpoints() throws NoSuchMethodException {
        Method triggerJenkinsJob = CicdController.class.getMethod("triggerJenkinsJob", Long.class, String.class);
        Method triggerPipelineBuild = CicdController.class.getMethod("triggerPipelineBuild", Long.class);

        assertThat(triggerJenkinsJob.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(triggerJenkinsJob.getAnnotation(RequirePermission.class).value()).isEqualTo("cicd:build");
        assertThat(triggerPipelineBuild.getAnnotation(RequirePermission.class)).isNotNull();
        assertThat(triggerPipelineBuild.getAnnotation(RequirePermission.class).value()).isEqualTo("cicd:build");
    }
}
