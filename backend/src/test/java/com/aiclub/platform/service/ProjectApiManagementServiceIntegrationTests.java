package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectApiDebugRecordSummary;
import com.aiclub.platform.dto.ProjectApiEndpointDetail;
import com.aiclub.platform.dto.ProjectApiExportDocument;
import com.aiclub.platform.dto.ProjectApiImportResult;
import com.aiclub.platform.dto.ProjectApiTreeSummary;
import com.aiclub.platform.dto.request.ProjectApiDebugExecuteRequest;
import com.aiclub.platform.dto.request.ProjectApiEndpointRequest;
import com.aiclub.platform.dto.request.ProjectApiEnvironmentAuthConfigRequest;
import com.aiclub.platform.dto.request.ProjectApiEnvironmentRequest;
import com.aiclub.platform.dto.request.ProjectApiImportRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 覆盖 API 管理的 OpenAPI 导入导出和后端代理调试主链路。
 */
@SpringBootTest
@Transactional
class ProjectApiManagementServiceIntegrationTests {

    @Autowired
    private ProjectApiManagementService projectApiManagementService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldImportJsonOpenApiAndExportYaml() {
        UserEntity creator = createUserWithProjectRole("api-import-creator", "导入人");
        ProjectEntity project = createProject(creator, "API 导入项目");
        loginAs(creator);

        ProjectApiImportResult importResult = projectApiManagementService.importOpenApi(
                project.getId(),
                new ProjectApiImportRequest(
                        "json",
                        "demo-openapi.json",
                        """
                                {
                                  "openapi": "3.0.3",
                                  "info": {
                                    "title": "示例 API",
                                    "description": "项目级 API 文档",
                                    "version": "1.2.3"
                                  },
                                  "servers": [
                                    {
                                      "url": "https://api.example.com/{tenant}",
                                      "description": "测试环境",
                                      "variables": {
                                        "tenant": {
                                          "default": "dev"
                                        }
                                      }
                                    }
                                  ],
                                  "paths": {
                                    "/users/{id}": {
                                      "get": {
                                        "tags": ["用户管理"],
                                        "summary": "查询用户",
                                        "description": "读取用户详情",
                                        "parameters": [
                                          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "example": "u-1001" },
                                          { "name": "traceId", "in": "header", "required": false, "schema": { "type": "string" }, "example": "trace-1" }
                                        ],
                                        "responses": {
                                          "200": {
                                            "description": "成功",
                                            "content": {
                                              "application/json": {
                                                "example": { "id": "u-1001", "name": "Alice" }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                                """
                )
        );

        assertThat(importResult.folderCount()).isEqualTo(1);
        assertThat(importResult.endpointCount()).isEqualTo(1);
        assertThat(importResult.environmentCount()).isEqualTo(1);

        ProjectApiTreeSummary tree = projectApiManagementService.getTree(project.getId());
        assertThat(tree.folders()).hasSize(1);
        assertThat(tree.folders().get(0).name()).isEqualTo("用户管理");
        assertThat(tree.folders().get(0).endpoints()).hasSize(1);
        assertThat(tree.folders().get(0).endpoints().get(0).path()).isEqualTo("/users/{id}");

        ProjectApiExportDocument export = projectApiManagementService.exportOpenApi(project.getId(), "yaml");
        assertThat(export.format()).isEqualTo("yaml");
        assertThat(export.content()).contains("openapi: \"3.0.3\"");
        assertThat(export.content()).contains("title: \"示例 API\"");
        assertThat(export.content()).contains("/users/{id}:");
        assertThat(export.content()).contains("url: \"https://api.example.com/{tenant}\"");
    }

    @Test
    void shouldImportYamlOpenApi() {
        UserEntity creator = createUserWithProjectRole("api-yaml-creator", "Yaml导入人");
        ProjectEntity project = createProject(creator, "YAML 导入项目");
        loginAs(creator);

        ProjectApiImportResult importResult = projectApiManagementService.importOpenApi(
                project.getId(),
                new ProjectApiImportRequest(
                        "yaml",
                        "demo-openapi.yaml",
                        """
                                openapi: 3.0.3
                                info:
                                  title: YAML 示例 API
                                  version: 0.9.0
                                paths:
                                  /health:
                                    get:
                                      summary: 健康检查
                                      responses:
                                        "200":
                                          description: OK
                                """
                )
        );

        assertThat(importResult.endpointCount()).isEqualTo(1);
        assertThat(projectApiManagementService.getTree(project.getId()).rootEndpoints()).hasSize(1);
        assertThat(projectApiManagementService.getTree(project.getId()).rootEndpoints().get(0).name()).isEqualTo("健康检查");
    }

    @Test
    void shouldRejectInvalidOpenApiDocument() {
        UserEntity creator = createUserWithProjectRole("api-invalid-creator", "非法导入人");
        ProjectEntity project = createProject(creator, "非法导入项目");
        loginAs(creator);

        assertThatThrownBy(() -> projectApiManagementService.importOpenApi(
                project.getId(),
                new ProjectApiImportRequest(
                        "json",
                        "invalid.json",
                        "{\"openapi\":\"3.0.3\",\"info\":{\"title\":\"broken\"}}"
                )
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("OpenAPI 文档缺少 paths 定义");
    }

    @Test
    void shouldExecuteDebugAndMaskSensitiveValues() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/debug/users/42", exchange -> {
            byte[] responseBytes = """
                    {"token":"server-secret","user":{"name":"Alice"}}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            UserEntity creator = createUserWithProjectRole("api-debug-creator", "调试人");
            ProjectEntity project = createProject(creator, "调试项目");
            loginAs(creator);

            projectApiManagementService.createEnvironment(project.getId(), new ProjectApiEnvironmentRequest(
                    "本地环境",
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    java.util.Map.of("userId", "42"),
                    "BEARER",
                    new ProjectApiEnvironmentAuthConfigRequest("env-secret-token", "", "", "", "", ""),
                    true
            ));

            ProjectApiEndpointDetail endpoint = projectApiManagementService.createEndpoint(project.getId(), new ProjectApiEndpointRequest(
                    null,
                    "更新用户",
                    "POST",
                    "/debug/users/{id}",
                    "更新用户资料",
                    "测试调试能力",
                    "application/json",
                    List.of(new com.aiclub.platform.dto.request.ProjectApiParameterItemRequest("id", true, "string", "{{userId}}", "用户ID")),
                    List.of(),
                    List.of(),
                    "{\"password\":\"client-secret\",\"profile\":{\"displayName\":\"Alice\"}}",
                    List.of(),
                    new com.aiclub.platform.dto.request.ProjectApiDebugConfigRequest(null)
            ));

            ProjectApiDebugRecordSummary result = projectApiManagementService.executeDebug(
                    project.getId(),
                    endpoint.id(),
                    new ProjectApiDebugExecuteRequest(
                            null,
                            null,
                            null,
                            null,
                            List.of(),
                            List.of(),
                            List.of(),
                            "{\"password\":\"client-secret\",\"profile\":{\"displayName\":\"Alice\"}}"
                    )
            );

            assertThat(result.success()).isTrue();
            assertThat(result.requestSnapshot().url()).endsWith("/debug/users/42");
            assertThat(result.requestSnapshot().headers()).anyMatch(item -> "Authorization".equalsIgnoreCase(item.name()) && "******".equals(item.value()));
            assertThat(result.requestSnapshot().body()).contains("\"password\" : \"******\"");
            assertThat(result.responseSnapshot().body()).contains("\"token\" : \"******\"");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void shouldCaptureBinaryDebugResponseSummary() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/binary", exchange -> {
            byte[] responseBytes = new byte[] {1, 2, 3, 4, 5};
            exchange.getResponseHeaders().add("Content-Type", "application/octet-stream");
            exchange.sendResponseHeaders(200, responseBytes.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(responseBytes);
            }
        });
        server.start();
        try {
            UserEntity creator = createUserWithProjectRole("api-binary-creator", "二进制调试人");
            ProjectEntity project = createProject(creator, "二进制调试项目");
            loginAs(creator);

            projectApiManagementService.createEnvironment(project.getId(), new ProjectApiEnvironmentRequest(
                    "本地二进制环境",
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    java.util.Map.of(),
                    "NONE",
                    new ProjectApiEnvironmentAuthConfigRequest("", "", "", "", "", ""),
                    true
            ));

            ProjectApiEndpointDetail endpoint = projectApiManagementService.createEndpoint(project.getId(), new ProjectApiEndpointRequest(
                    null,
                    "下载文件",
                    "GET",
                    "/binary",
                    "下载二进制",
                    "",
                    "none",
                    List.of(),
                    List.of(),
                    List.of(),
                    "",
                    List.of(),
                    new com.aiclub.platform.dto.request.ProjectApiDebugConfigRequest(null)
            ));

            ProjectApiDebugRecordSummary result = projectApiManagementService.executeDebug(
                    project.getId(),
                    endpoint.id(),
                    new ProjectApiDebugExecuteRequest(null, null, null, null, List.of(), List.of(), List.of(), "")
            );

            assertThat(result.success()).isTrue();
            assertThat(result.responseSnapshot().binary()).isTrue();
            assertThat(result.responseSnapshot().bodyPreview()).contains("5 字节");
            assertThat(result.responseSnapshot().body()).isEmpty();
        } finally {
            server.stop(0);
        }
    }

    private UserEntity createUserWithProjectRole(String username, String nickname) {
        RoleEntity role = new RoleEntity();
        role.setName(username + "-role");
        role.setCode("ROLE_" + username.toUpperCase());
        role.setEnabled(true);
        role.setBuiltIn(false);
        role.setDescription("API 管理测试角色");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role = roleRepository.save(role);

        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setPasswordHash("pwd");
        user.setNickname(nickname);
        user.setEmail(username + "@example.com");
        user.setPhone("13800000000");
        user.setGitlabUsername(username);
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(Set.of(role)));
        return userRepository.save(user);
    }

    private ProjectEntity createProject(UserEntity creator, String name) {
        ProjectEntity project = new ProjectEntity();
        project.setName(name);
        project.setOwner(creator.getNickname());
        project.setOwnerUser(creator);
        project.setCreatorUser(creator);
        project.setStatus("进行中");
        project.setDescription("API 管理测试项目");
        project.setMembers(new LinkedHashSet<>(Set.of(creator)));
        return projectRepository.save(project);
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                Set.of("ROLE_TEST"),
                Set.of("api:view", "api:manage", "project:view", "project:manage")
        ));
    }
}
