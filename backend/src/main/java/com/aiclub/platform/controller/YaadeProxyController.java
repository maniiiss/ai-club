package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.security.YaadeProxySessionStore;
import com.aiclub.platform.service.YaadeClientService;
import com.aiclub.platform.service.YaadeEmbedSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Yaade 嵌入代理。
 * iframe 请求不携带平台 Bearer Token，这里改为读取平台侧 HttpOnly 代理 cookie，并转发到真实 Yaade 服务。
 */
@RestController
@RequestMapping("/api/yaade/proxy")
@OperationLog(skip = true)
public class YaadeProxyController {

    private static final String PROXY_PREFIX = "/api/yaade/proxy";
    private static final Pattern ASSET_REFERENCE_PATTERN = Pattern.compile("(\\./assets/[^\"']+)");
    private static final List<String> HOP_BY_HOP_HEADERS = List.of(
            "connection",
            "content-length",
            "host",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailers",
            "transfer-encoding",
            "upgrade",
            "cookie",
            "authorization",
            "cache-control",
            "etag",
            "expires",
            "last-modified"
    );

    private final YaadeEmbedSessionService yaadeEmbedSessionService;
    private final YaadeClientService yaadeClientService;

    public YaadeProxyController(YaadeEmbedSessionService yaadeEmbedSessionService,
                                YaadeClientService yaadeClientService) {
        this.yaadeEmbedSessionService = yaadeEmbedSessionService;
        this.yaadeClientService = yaadeClientService;
    }

    @RequestMapping({"", "/", "/**"})
    public void proxy(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String relativePath = resolveRelativePath(request);
        if ("POST".equalsIgnoreCase(request.getMethod()) && "/api/logout".equals(relativePath)) {
            response.setStatus(HttpStatus.NO_CONTENT.value());
            return;
        }
        if ("PUT".equalsIgnoreCase(request.getMethod()) && "/api/user".equals(relativePath)) {
            writePlain(response, HttpStatus.FORBIDDEN, "嵌入模式不允许在 Yaade 中修改本地密码");
            return;
        }

        String sessionId = yaadeEmbedSessionService.readProxySessionId(request);
        if (sessionId == null || sessionId.isBlank()) {
            writePlain(response, HttpStatus.UNAUTHORIZED, "Yaade 会话不存在，请重新进入 API 管理页面");
            return;
        }

        YaadeProxySessionStore.ProxySessionSnapshot snapshot = yaadeEmbedSessionService.readProxySession(request)
                .orElse(null);
        if (snapshot == null) {
            writePlain(response, HttpStatus.UNAUTHORIZED, "Yaade 会话已过期，请重新进入 API 管理页面");
            return;
        }

        byte[] requestBody = StreamUtils.copyToByteArray(request.getInputStream());
        Map<String, String> headers = extractForwardHeaders(request);
        YaadeClientService.RawResponse proxied = yaadeClientService.forwardProxyRequest(
                request.getMethod(),
                appendQuery(relativePath, request.getQueryString()),
                snapshot.remoteCookieHeader(),
                headers,
                requestBody
        );
        if (proxied.isUnauthorized()) {
            snapshot = yaadeEmbedSessionService.refreshRemoteSession(sessionId);
            proxied = yaadeClientService.forwardProxyRequest(
                    request.getMethod(),
                    appendQuery(relativePath, request.getQueryString()),
                    snapshot.remoteCookieHeader(),
                    headers,
                    requestBody
            );
        }
        String updatedCookieHeader = buildCookieHeader(proxied.setCookieHeaders());
        if (!updatedCookieHeader.isBlank() && !updatedCookieHeader.equals(snapshot.remoteCookieHeader())) {
            yaadeEmbedSessionService.updateRemoteCookie(sessionId, snapshot, updatedCookieHeader);
        }
        writeProxyResponse(response, relativePath, proxied);
    }

    private Map<String, String> extractForwardHeaders(HttpServletRequest request) {
        Map<String, String> headers = new LinkedHashMap<>();
        var headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String headerName = headerNames.nextElement();
            if (headerName == null) {
                continue;
            }
            String normalized = headerName.toLowerCase(Locale.ROOT);
            if (HOP_BY_HOP_HEADERS.contains(normalized)) {
                continue;
            }
            String value = request.getHeader(headerName);
            if (value != null && !value.isBlank()) {
                headers.put(headerName, value);
            }
        }
        return headers;
    }

    private String resolveRelativePath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
        String fullPrefix = contextPath + PROXY_PREFIX;
        if (!uri.startsWith(fullPrefix)) {
            return "/";
        }
        String relative = uri.substring(fullPrefix.length());
        return relative.isBlank() ? "/" : relative;
    }

    private String appendQuery(String relativePath, String queryString) {
        if (queryString == null || queryString.isBlank()) {
            return relativePath;
        }
        return relativePath + "?" + queryString;
    }

    private void writeProxyResponse(HttpServletResponse response,
                                    String relativePath,
                                    YaadeClientService.RawResponse proxied) throws IOException {
        response.setStatus(proxied.statusCode());
        proxied.headers().forEach((headerName, values) -> {
            if (headerName == null || values == null || values.isEmpty()) {
                return;
            }
            String normalized = headerName.toLowerCase(Locale.ROOT);
            if (HOP_BY_HOP_HEADERS.contains(normalized) || "set-cookie".equals(normalized)) {
                return;
            }
            values.forEach(value -> response.addHeader(headerName, value));
        });
        if (proxied.contentType() != null && !proxied.contentType().isBlank()) {
            response.setContentType(proxied.contentType());
        }
        if (isStaticLikeResponse(relativePath, proxied.contentType())) {
            response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store, no-cache, must-revalidate, max-age=0");
            response.setHeader("Pragma", "no-cache");
        }
        byte[] responseBody = proxied.body();
        if (responseBody != null && responseBody.length > 0) {
            if (isHtmlResponse(proxied.contentType())) {
                responseBody = rewriteHtmlAssetReferences(responseBody);
            }
            response.getOutputStream().write(responseBody);
        }
    }

    private boolean isHtmlResponse(String contentType) {
        return contentType != null && contentType.toLowerCase(Locale.ROOT).contains("text/html");
    }

    private boolean isStaticLikeResponse(String relativePath, String contentType) {
        if (isHtmlResponse(contentType)) {
            return true;
        }
        if (relativePath == null) {
            return false;
        }
        return relativePath.startsWith("/assets/")
                || relativePath.startsWith("/favicon")
                || relativePath.startsWith("/manifest");
    }

    private byte[] rewriteHtmlAssetReferences(byte[] sourceBody) {
        String html = new String(sourceBody, StandardCharsets.UTF_8);
        String cacheBustValue = String.valueOf(System.currentTimeMillis());
        Matcher matcher = ASSET_REFERENCE_PATTERN.matcher(html);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String assetPath = matcher.group(1);
            String replacement = assetPath.contains("?")
                    ? assetPath + "&v=" + cacheBustValue
                    : assetPath + "?v=" + cacheBustValue;
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(buffer);
        return buffer.toString().getBytes(StandardCharsets.UTF_8);
    }

    private void writePlain(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("text/plain;charset=UTF-8");
        response.getWriter().write(message);
    }

    private String buildCookieHeader(List<String> setCookieHeaders) {
        if (setCookieHeaders == null || setCookieHeaders.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (String header : setCookieHeaders) {
            if (header == null || header.isBlank()) {
                continue;
            }
            String firstSegment = header.split(";", 2)[0].trim();
            if (firstSegment.isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append("; ");
            }
            builder.append(firstSegment);
        }
        return builder.toString();
    }
}
