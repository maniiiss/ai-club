package com.aiclub.platform.controller;

import com.aiclub.platform.dto.HermesInternalToolExecuteResponse;
import com.aiclub.platform.dto.request.HermesInternalToolExecuteRequest;
import com.aiclub.platform.service.HermesInternalToolExecutionService;
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
 * 仅供 Python MCP bridge 调用的内部 Hermes 工具执行控制器。
 */
@RestController
@RequestMapping("/internal/hermes/mcp")
public class InternalHermesController {

    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final HermesInternalToolExecutionService hermesInternalToolExecutionService;

    public InternalHermesController(InternalServiceAuthenticator internalServiceAuthenticator,
                                    HermesInternalToolExecutionService hermesInternalToolExecutionService) {
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.hermesInternalToolExecutionService = hermesInternalToolExecutionService;
    }

    /**
     * 执行一条 Hermes 通过 MCP bridge 转发过来的内部平台工具调用。
     */
    @PostMapping("/execute")
    public HermesInternalToolExecuteResponse executeTool(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                                         HttpServletRequest servletRequest,
                                                         @Valid @RequestBody HermesInternalToolExecuteRequest request) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return hermesInternalToolExecutionService.execute(request);
    }
}
