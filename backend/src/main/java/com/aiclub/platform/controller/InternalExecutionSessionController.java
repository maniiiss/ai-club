package com.aiclub.platform.controller;

import com.aiclub.platform.dto.request.ExecutionSessionCompleteRequest;
import com.aiclub.platform.dto.request.ExecutionSessionEventsRequest;
import com.aiclub.platform.service.ExecutionAsyncSessionService;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 仅供 code-processing runner 回调的执行会话控制器。
 */
@RestController
@RequestMapping("/internal/execution-sessions")
public class InternalExecutionSessionController {

    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final ExecutionAsyncSessionService executionAsyncSessionService;

    public InternalExecutionSessionController(InternalServiceAuthenticator internalServiceAuthenticator,
                                              ExecutionAsyncSessionService executionAsyncSessionService) {
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.executionAsyncSessionService = executionAsyncSessionService;
    }

    @PostMapping("/{sessionId}/events")
    public Map<String, Object> recordEvents(@PathVariable String sessionId,
                                            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                            HttpServletRequest servletRequest,
                                            @RequestBody ExecutionSessionEventsRequest request) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        executionAsyncSessionService.recordRunnerEvents(sessionId, request);
        return Map.of("status", "accepted");
    }

    @PostMapping("/{sessionId}/complete")
    public Map<String, Object> complete(@PathVariable String sessionId,
                                        @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                        HttpServletRequest servletRequest,
                                        @RequestBody ExecutionSessionCompleteRequest request) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        executionAsyncSessionService.completeRunnerSession(sessionId, request);
        return Map.of("status", "accepted");
    }
}
