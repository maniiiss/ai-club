package com.aiclub.platform.controller;

import com.aiclub.platform.dto.AssistantInternalToolExecuteResponse;
import com.aiclub.platform.dto.request.AssistantInternalToolExecuteRequest;
import com.aiclub.platform.dto.request.RuntimeEventRequest;
import com.aiclub.platform.dto.request.RuntimeToolExecuteRequest;
import com.aiclub.platform.service.AssistantInternalToolExecutionService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.RuntimeEventIngestService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Pi Runtime 到 backend 的内部事件和受控平台工具网关。 */
@RestController
@RequestMapping("/internal/runtime")
public class InternalRuntimeController {

    private final InternalServiceAuthenticator authenticator;
    private final RuntimeEventIngestService eventIngestService;
    private final AssistantInternalToolExecutionService assistantToolExecutionService;

    public InternalRuntimeController(InternalServiceAuthenticator authenticator,
                                     RuntimeEventIngestService eventIngestService,
                                     AssistantInternalToolExecutionService assistantToolExecutionService) {
        this.authenticator = authenticator;
        this.eventIngestService = eventIngestService;
        this.assistantToolExecutionService = assistantToolExecutionService;
    }

    @PostMapping("/events")
    public java.util.Map<String, Object> ingestEvent(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
            HttpServletRequest servletRequest,
            @Valid @RequestBody RuntimeEventRequest request) {
        authenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return java.util.Map.of("accepted", eventIngestService.ingest(request));
    }

    @PostMapping("/tools/execute")
    public AssistantInternalToolExecuteResponse executeTool(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
            HttpServletRequest servletRequest,
            @Valid @RequestBody RuntimeToolExecuteRequest request) {
        authenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return assistantToolExecutionService.execute(new AssistantInternalToolExecuteRequest(
                request.sessionToken(), request.toolCode(), request.arguments()));
    }
}
