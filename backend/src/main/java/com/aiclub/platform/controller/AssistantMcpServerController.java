package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AssistantMcpConnectionTestResult;
import com.aiclub.platform.dto.AssistantMcpServerSummary;
import com.aiclub.platform.dto.request.AssistantMcpServerRequest;
import com.aiclub.platform.dto.request.AssistantMcpToolExecuteRequest;
import com.aiclub.platform.service.AssistantMcpServerService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GitPilot 用户个人 MCP 服务配置接口。 */
@RestController
@RequestMapping("/api/assistant/mcp-servers")
@OperationLog(skip = true)
public class AssistantMcpServerController {

    private final AssistantMcpServerService service;

    public AssistantMcpServerController(AssistantMcpServerService service) {
        this.service = service;
    }

    /** 读取当前用户自己的 MCP 服务列表。 */
    @GetMapping
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<List<AssistantMcpServerSummary>> list() { return ApiResponse.success(service.listMine()); }

    /** 测试未保存的 MCP 配置并发现工具。 */
    @PostMapping("/test")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMcpConnectionTestResult> test(@Valid @RequestBody AssistantMcpServerRequest request) {
        return ApiResponse.success(service.test(request));
    }

    /** 新增 MCP 服务。 */
    @PostMapping
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMcpServerSummary> create(@Valid @RequestBody AssistantMcpServerRequest request) {
        return ApiResponse.success(service.create(request));
    }

    /** 更新 MCP 服务。 */
    @PutMapping("/{id}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMcpServerSummary> update(@PathVariable Long id, @Valid @RequestBody AssistantMcpServerRequest request) {
        return ApiResponse.success(service.update(id, request));
    }

    /** 重新测试已保存 MCP 服务。 */
    @PostMapping("/{id}/test")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMcpServerSummary> retest(@PathVariable Long id) { return ApiResponse.success(service.retest(id)); }

    /** 启用或停用 MCP 服务。 */
    @PatchMapping("/{id}/enabled")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<AssistantMcpServerSummary> setEnabled(@PathVariable Long id, @RequestBody EnabledRequest request) {
        return ApiResponse.success(service.setEnabled(id, request.enabled()));
    }

    /** 删除 MCP 服务。 */
    @DeleteMapping("/{id}")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<Void> delete(@PathVariable Long id) { service.delete(id); return new ApiResponse<>(true, "ok", null); }

    /** 执行动作卡片确认后的外部 MCP 工具调用。 */
    @PostMapping("/actions/execute")
    @RequirePermission(value = "assistant:chat", anyOf = {"hermes:chat"})
    public ApiResponse<String> executeConfirmedTool(@Valid @RequestBody AssistantMcpToolExecuteRequest request) {
        Long userId = service.currentUserIdForAction();
        service.validateActionConfirmation(userId, request.scopeKey(), request.clientConversationId(),
                request.confirmationToken(), request.toolCode(), request.arguments());
        return ApiResponse.success(service.executeConfirmedExternalTool(
                userId, request.toolCode(), request.arguments()));
    }

    /** 启停请求体。 */
    public record EnabledRequest(boolean enabled) { }
}
