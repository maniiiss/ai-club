package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.request.InternalObservabilityLogIngestRequest;
import com.aiclub.platform.service.ObservabilityIngestAuthenticator;
import com.aiclub.platform.service.ProjectLogIngestService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 应用日志主动上报内部接口。
 */
@RestController
@RequestMapping("/internal/observability")
public class InternalObservabilityController {

    private final ObservabilityIngestAuthenticator observabilityIngestAuthenticator;
    private final ProjectLogIngestService projectLogIngestService;

    public InternalObservabilityController(ObservabilityIngestAuthenticator observabilityIngestAuthenticator,
                                           ProjectLogIngestService projectLogIngestService) {
        this.observabilityIngestAuthenticator = observabilityIngestAuthenticator;
        this.projectLogIngestService = projectLogIngestService;
    }

    @PostMapping("/logs")
    public ApiResponse<Void> ingestLogs(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                        HttpServletRequest servletRequest,
                                        @Valid @RequestBody InternalObservabilityLogIngestRequest request) {
        observabilityIngestAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        projectLogIngestService.ingestPushLogs(request.runtimeInstanceId(), request.entries());
        return ApiResponse.success(null);
    }
}
