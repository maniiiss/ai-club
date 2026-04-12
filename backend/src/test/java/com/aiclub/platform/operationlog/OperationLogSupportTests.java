package com.aiclub.platform.operationlog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 覆盖操作日志的默认脱敏与业务主键提取规则，避免后续回归。
 */
class OperationLogSupportTests {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 请求摘要应默认对密码、令牌与鉴权头做脱敏，只保留排障必需信息。
     */
    @Test
    void shouldMaskSensitiveFieldsInRequestSnapshot() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.addParameter("authorization", "Bearer token-value");

        OperationLogContext context = new OperationLogContext(
                System.nanoTime(),
                "POST",
                "/api/auth/login",
                "/api/auth/login",
                "AUTH",
                "认证与账户",
                "AUTH_LOGIN",
                "登录",
                "USER",
                null,
                null
        );
        context.setRequestBody(objectMapper.readTree("""
                {
                  "username": "admin",
                  "password": "123456",
                  "token": "raw-token"
                }
                """));

        String snapshot = OperationLogSupport.buildRequestSnapshot(request, context, objectMapper);
        JsonNode root = objectMapper.readTree(snapshot);

        assertThat(root.path("body").path("username").asText()).isEqualTo("admin");
        assertThat(root.path("body").path("password").asText()).isEqualTo("******");
        assertThat(root.path("body").path("token").asText()).isEqualTo("******");
        assertThat(root.path("query").path("authorization").asText()).isEqualTo("******");
    }

    /**
     * 业务主键提取应优先识别常见路径变量，并给出稳定的业务类型推断。
     */
    @Test
    void shouldResolveBizTargetFromCommonPathVariables() {
        OperationLogSupport.ResolvedBizTarget projectTarget = OperationLogSupport.resolveBizTarget(
                Map.of("projectId", "12"),
                "/api/projects/{projectId}/iterations",
                null,
                null
        );
        OperationLogSupport.ResolvedBizTarget defaultIdTarget = OperationLogSupport.resolveBizTarget(
                Map.of("id", "33"),
                "/api/users/{id}/reset-password",
                null,
                null
        );

        assertThat(projectTarget.bizType()).isEqualTo("PROJECT");
        assertThat(projectTarget.bizId()).isEqualTo(12L);
        assertThat(defaultIdTarget.bizType()).isEqualTo("USER");
        assertThat(defaultIdTarget.bizId()).isEqualTo(33L);
    }

    /**
     * 敏感字段识别需要覆盖常见大小写和下划线变体。
     */
    @Test
    void shouldRecognizeSensitiveFieldVariants() {
        assertThat(OperationLogSupport.isSensitiveField("password")).isTrue();
        assertThat(OperationLogSupport.isSensitiveField("newPassword")).isTrue();
        assertThat(OperationLogSupport.isSensitiveField("api_key")).isTrue();
        assertThat(OperationLogSupport.isSensitiveField("Authorization")).isTrue();
        assertThat(OperationLogSupport.isSensitiveField("username")).isFalse();
    }
}
