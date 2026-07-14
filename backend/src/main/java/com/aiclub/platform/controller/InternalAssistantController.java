package com.aiclub.platform.controller;

import com.aiclub.platform.dto.AssistantInternalToolExecuteResponse;
import com.aiclub.platform.dto.request.AssistantInternalToolExecuteRequest;
import com.aiclub.platform.service.AssistantInternalToolExecutionService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 仅供 Python MCP bridge 调用的内部 Assistant 工具执行控制器。
 */
@RestController
@RequestMapping("/internal/assistant/mcp")
public class InternalAssistantController {

    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final AssistantInternalToolExecutionService assistantInternalToolExecutionService;

    public InternalAssistantController(InternalServiceAuthenticator internalServiceAuthenticator,
                                    AssistantInternalToolExecutionService assistantInternalToolExecutionService) {
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.assistantInternalToolExecutionService = assistantInternalToolExecutionService;
    }

    /**
     * 执行一条 Assistant 通过 MCP bridge 转发过来的内部平台工具调用。
     */
    @PostMapping("/execute")
    public AssistantInternalToolExecuteResponse executeTool(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                                         HttpServletRequest servletRequest,
                                                         @Valid @RequestBody AssistantInternalToolExecuteRequest request) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return assistantInternalToolExecutionService.execute(request);
    }
}
