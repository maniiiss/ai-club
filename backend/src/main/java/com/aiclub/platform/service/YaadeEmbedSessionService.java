package com.aiclub.platform.service;

import com.aiclub.platform.dto.YaadeEmbedSessionSummary;
import com.aiclub.platform.dto.YaadeProjectContextSummary;
import com.aiclub.platform.dto.YaadeHealthSummary;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.security.YaadeProxySessionStore;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Yaade iframe 嵌入会话服务。
 */
@Service
@Transactional(readOnly = true)
public class YaadeEmbedSessionService {

    private static final String PROXY_PATH = "/api/yaade/proxy";

    private final YaadeProjectSyncService yaadeProjectSyncService;
    private final YaadeUserSyncService yaadeUserSyncService;
    private final YaadeProxySessionStore yaadeProxySessionStore;
    private final YaadeClientService yaadeClientService;
    private final YaadeProperties yaadeProperties;

    public YaadeEmbedSessionService(YaadeProjectSyncService yaadeProjectSyncService,
                                    YaadeUserSyncService yaadeUserSyncService,
                                    YaadeProxySessionStore yaadeProxySessionStore,
                                    YaadeClientService yaadeClientService,
                                    YaadeProperties yaadeProperties) {
        this.yaadeProjectSyncService = yaadeProjectSyncService;
        this.yaadeUserSyncService = yaadeUserSyncService;
        this.yaadeProxySessionStore = yaadeProxySessionStore;
        this.yaadeClientService = yaadeClientService;
        this.yaadeProperties = yaadeProperties;
    }

    @Transactional
    public YaadeEmbedSessionSummary createEmbedSession(Long projectId, HttpServletRequest request, HttpServletResponse response) {
        Long userId = AuthContextHolder.get()
                .map(authContext -> authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        List<YaadeProjectContextSummary> projectContexts = yaadeProjectSyncService.listVisibleProjectContextsEnsuringBindings();
        var selectedProject = projectId == null ? null : yaadeProjectSyncService.requireVisibleProject(projectId);
        YaadeProjectSyncService.EnsureProjectBindingResult bindingResult = projectId == null
                ? yaadeProjectSyncService.ensurePublicCollection()
                : yaadeProjectSyncService.ensureProjectBinding(selectedProject);
        YaadeUserSyncService.YaadeAuthenticatedUserSession userSession = yaadeUserSyncService.loginCurrentUserWithSyncedGroups(selectedProject);
        String sessionId = UUID.randomUUID().toString();
        yaadeProxySessionStore.save(
                sessionId,
                new YaadeProxySessionStore.ProxySessionSnapshot(
                        userId,
                        userSession.username(),
                        userSession.session().cookieHeader()
                ),
                Duration.ofMinutes(yaadeProperties.getProxySessionTtlMinutes())
        );
        writeProxyCookie(response, sessionId, false, isSecureRequest(request));
        String iframePath = buildIframePath(bindingResult.summary());
        return new YaadeEmbedSessionSummary(bindingResult.summary(), iframePath, bindingResult.created(), projectContexts);
    }

    public YaadeProjectBindingSummary getProjectBindingSummary(Long projectId) {
        return yaadeProjectSyncService.getBindingSummary(projectId);
    }

    public YaadeHealthSummary getHealthSummary() {
        boolean available = yaadeClientService.isHealthy();
        return new YaadeHealthSummary(
                available,
                yaadeProperties.getBaseUrl(),
                available ? "ok" : "Yaade 服务不可用或登录配置异常"
        );
    }

    @Transactional
    public YaadeProjectBindingSummary repairProjectBinding(Long projectId) {
        return yaadeProjectSyncService.ensureProjectBinding(yaadeProjectSyncService.requireEditableProject(projectId)).summary();
    }

    public Optional<YaadeProxySessionStore.ProxySessionSnapshot> readProxySession(HttpServletRequest request) {
        return readProxyCookie(request).flatMap(yaadeProxySessionStore::get);
    }

    public String readProxySessionId(HttpServletRequest request) {
        return readProxyCookie(request).orElse(null);
    }

    @Transactional
    public YaadeProxySessionStore.ProxySessionSnapshot refreshRemoteSession(String sessionId) {
        YaadeProxySessionStore.ProxySessionSnapshot snapshot = yaadeProxySessionStore.get(sessionId)
                .orElseThrow(() -> new IllegalStateException("Yaade 代理会话不存在"));
        YaadeUserSyncService.YaadeAuthenticatedUserSession refreshed = yaadeUserSyncService.reauthenticateManagedUser(snapshot.userId());
        YaadeProxySessionStore.ProxySessionSnapshot nextSnapshot = new YaadeProxySessionStore.ProxySessionSnapshot(
                snapshot.userId(),
                refreshed.username(),
                refreshed.session().cookieHeader()
        );
        yaadeProxySessionStore.save(sessionId, nextSnapshot, Duration.ofMinutes(yaadeProperties.getProxySessionTtlMinutes()));
        return nextSnapshot;
    }

    @Transactional
    public void updateRemoteCookie(String sessionId, YaadeProxySessionStore.ProxySessionSnapshot snapshot, String remoteCookieHeader) {
        yaadeProxySessionStore.save(
                sessionId,
                new YaadeProxySessionStore.ProxySessionSnapshot(snapshot.userId(), snapshot.yaadeUsername(), remoteCookieHeader),
                Duration.ofMinutes(yaadeProperties.getProxySessionTtlMinutes())
        );
    }

    @Transactional
    public void clearProxySession(HttpServletRequest request, HttpServletResponse response) {
        readProxyCookie(request).ifPresent(yaadeProxySessionStore::delete);
        writeProxyCookie(response, "", true, isSecureRequest(request));
    }

    private Optional<String> readProxyCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null || cookies.length == 0) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(cookie -> YaadeProxySessionStore.COOKIE_NAME.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private String buildIframePath(YaadeProjectBindingSummary summary) {
        Long collectionId = summary.yaadeCollectionId();
        String hash = collectionId == null ? "" : "#/" + collectionId;
        return PROXY_PATH + "/" + hash;
    }

    private void writeProxyCookie(HttpServletResponse response, String sessionId, boolean clear, boolean secure) {
        ResponseCookie cookie = ResponseCookie.from(YaadeProxySessionStore.COOKIE_NAME, clear ? "" : sessionId)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path(PROXY_PATH)
                .maxAge(clear ? Duration.ZERO : Duration.ofMinutes(yaadeProperties.getProxySessionTtlMinutes()))
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private boolean isSecureRequest(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        if (request.isSecure()) {
            return true;
        }
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        return forwardedProto != null && forwardedProto.equalsIgnoreCase("https");
    }
}
