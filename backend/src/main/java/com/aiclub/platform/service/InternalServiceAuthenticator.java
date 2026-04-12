package com.aiclub.platform.service;

import com.aiclub.platform.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

/**
 * 统一校验平台内部服务之间使用的共享 Bearer Token。
 */
@Service
public class InternalServiceAuthenticator {

    private final String serviceToken;
    private final boolean allowLocalBypass;

    public InternalServiceAuthenticator(@Value("${platform.internal.service-token:git-ai-club-internal-service-token}") String serviceToken,
                                        @Value("${platform.internal.allow-local-bypass:true}") boolean allowLocalBypass) {
        this.serviceToken = serviceToken == null || serviceToken.trim().isEmpty()
                ? "git-ai-club-internal-service-token"
                : serviceToken.trim();
        this.allowLocalBypass = allowLocalBypass;
    }

    /**
     * 校验内部接口请求头中的 Bearer Token。
     */
    public void requireAuthorized(String authorizationHeader, String remoteAddress) {
        if (allowLocalBypass && isLoopbackAddress(remoteAddress)) {
            return;
        }
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new UnauthorizedException("缺少内部服务认证信息");
        }
        String normalized = authorizationHeader.startsWith("Bearer ")
                ? authorizationHeader.substring("Bearer ".length()).trim()
                : authorizationHeader.trim();
        if (!serviceToken.equals(normalized)) {
            throw new UnauthorizedException("内部服务认证失败");
        }
    }

    /**
     * 生成内部服务调用时使用的标准 Authorization 请求头值。
     */
    public String authorizationHeaderValue() {
        return "Bearer " + serviceToken;
    }

    /**
     * 判断来源地址是否是本机回环地址。
     * 本地独立 code-processing 服务走 localhost 回调 backend internal 时，允许直接放行，避免开发态内部 token 不一致导致链路失败。
     */
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
