package com.aiclub.platform.controller;

import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestItem;
import com.aiclub.platform.dto.ModelUsageIngestDtos.ModelUsageIngestRequest;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.ModelUsageIngestService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 仅供 code-processing 回传模型用量的内部接口。
 *
 * <p>鉴权走 {@link InternalServiceAuthenticator} 共享 Bearer Token（与其它
 * {@code /internal/*} 控制器一致），不被 {@code AuthInterceptor} 拦截。
 */
@RestController
@RequestMapping("/internal/model-usage")
public class InternalModelUsageController {

    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final ModelUsageIngestService modelUsageIngestService;

    public InternalModelUsageController(InternalServiceAuthenticator internalServiceAuthenticator,
                                        ModelUsageIngestService modelUsageIngestService) {
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.modelUsageIngestService = modelUsageIngestService;
    }

    /**
     * 批量接收 code-processing 上报的模型用量事件并落账。
     */
    @PostMapping("/events")
    public Map<String, Object> ingestEvents(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                            HttpServletRequest servletRequest,
                                            @RequestBody ModelUsageIngestRequest request) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        List<ModelUsageIngestItem> events = request == null || request.events() == null
                ? List.of()
                : request.events();
        int accepted = modelUsageIngestService.ingest(events);
        return Map.of("status", "accepted", "accepted", accepted);
    }
}
