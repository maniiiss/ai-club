package com.aiclub.platform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * GitNexus 全仓图访问配置。
 * UI / serve 的对外地址优先使用显式配置；未配置时回退为“当前请求协议 + 当前主机 + 配置端口”。
 */
@Component
public class GitnexusProperties {

    private final boolean enabled;
    private final String uiPublicBaseUrl;
    private final int uiPublicPort;
    private final String servePublicBaseUrl;
    private final int servePublicPort;

    public GitnexusProperties(@Value("${platform.gitnexus.enabled:true}") boolean enabled,
                              @Value("${platform.gitnexus.ui-public-base-url:}") String uiPublicBaseUrl,
                              @Value("${platform.gitnexus.ui-public-port:5174}") int uiPublicPort,
                              @Value("${platform.gitnexus.serve-public-base-url:}") String servePublicBaseUrl,
                              @Value("${platform.gitnexus.serve-public-port:4747}") int servePublicPort) {
        this.enabled = enabled;
        this.uiPublicBaseUrl = trimTrailingSlash(uiPublicBaseUrl);
        this.uiPublicPort = normalizePort(uiPublicPort, 5174);
        this.servePublicBaseUrl = trimTrailingSlash(servePublicBaseUrl);
        this.servePublicPort = normalizePort(servePublicPort, 4747);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String resolveUiPublicBaseUrl(String requestScheme, String requestHost) {
        if (!uiPublicBaseUrl.isBlank()) {
            return uiPublicBaseUrl;
        }
        return buildBaseUrl(requestScheme, requestHost, uiPublicPort);
    }

    public String resolveServePublicBaseUrl(String requestScheme, String requestHost) {
        if (!servePublicBaseUrl.isBlank()) {
            return servePublicBaseUrl;
        }
        return buildBaseUrl(requestScheme, requestHost, servePublicPort);
    }

    public int getUiPublicPort() {
        return uiPublicPort;
    }

    public int getServePublicPort() {
        return servePublicPort;
    }

    private String buildBaseUrl(String requestScheme, String requestHost, int port) {
        String scheme = requestScheme == null || requestScheme.isBlank() ? "http" : requestScheme.trim();
        String host = requestHost == null || requestHost.isBlank() ? "localhost" : requestHost.trim();
        return scheme + "://" + host + ":" + port;
    }

    private int normalizePort(int candidate, int fallback) {
        return candidate > 0 && candidate <= 65535 ? candidate : fallback;
    }

    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
