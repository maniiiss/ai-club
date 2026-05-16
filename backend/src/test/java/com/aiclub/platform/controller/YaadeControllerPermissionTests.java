package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.dto.request.YaadeApiTestCaseGenerationRequest;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Yaade AI 测试用例生成只读取接口资产并调用模型，不写回 Yaade，因此使用 api:view 权限。
 */
class YaadeControllerPermissionTests {

    @Test
    void shouldUseViewPermissionForApiTestCaseGenerationEndpoints() throws NoSuchMethodException {
        Method listProjectRequests = YaadeController.class.getMethod("listProjectRequests", Long.class);
        Method generateApiTestCases = YaadeController.class.getMethod("generateApiTestCases", Long.class, Long.class, YaadeApiTestCaseGenerationRequest.class);

        assertThat(listProjectRequests.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
        assertThat(generateApiTestCases.getAnnotation(RequirePermission.class).value()).isEqualTo("api:view");
    }
}
