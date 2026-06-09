package com.aiclub.platform.service;

import com.aiclub.platform.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

/**
 * 可观测性日志主动上报鉴权器。
 * 与平台内部服务 Token 分离，避免把所有内部调用权限都交给应用日志上报链路。
 */
@Service
public class ObservabilityIngestAuthenticator {

    private final String ingestToken;
    private final boolean allowLocalBypass;

    public ObservabilityIngestAuthenticator(@Value("${platform.observability.ingest-token:git-ai-club-observability-token}") String ingestToken,
                                            @Value("${platform.internal.allow-local-bypass:true}") boolean allowLocalBypass) {
        this.ingestToken = ingestToken == null || ingestToken.trim().isEmpty()
                ? "git-ai-club-observability-token"
                : ingestToken.trim();
        this.allowLocalBypass = allowLocalBypass;
    }

    /**
     * 校验主动上报请求头中的 Bearer Token。
     */
    public void requireAuthorized(String authorizationHeader, String remoteAddress) {
        if (allowLocalBypass && isLoopbackAddress(remoteAddress)) {
            return;
        }
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new UnauthorizedException("缺少可观测性上报认证信息");
        }
        String normalized = authorizationHeader.startsWith("Bearer ")
                ? authorizationHeader.substring("Bearer ".length()).trim()
                : authorizationHeader.trim();
        if (!ingestToken.equals(normalized)) {
            throw new UnauthorizedException("可观测性上报认证失败");
        }
    }

    /**
     * 生成上报链路复用的 Authorization 请求头值。
     */
    public String authorizationHeaderValue() {
        return HttpHeaders.AUTHORIZATION + ": Bearer " + ingestToken;
    }

    private boolean isLoopbackAddress(String remoteAddress) {
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return false;
        }
        String normalized = remoteAddress.trim();
        return "127.0.0.1".equals(normalized)
                || "::1".equals(normalized)
                || "0:0:0:0:0:0:0:1".equals(normalized)
                || normalized.endsWith("127.0.0.1")
                || normalized.endsWith("::1")
                || normalized.endsWith("0:0:0:0:0:0:0:1");
    }
}
