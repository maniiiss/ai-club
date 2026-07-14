package com.aiclub.platform.service;

import com.aiclub.platform.dto.RuntimeRegistrySummary;
import com.aiclub.platform.runtime.RuntimeHealth;
import com.aiclub.platform.runtime.RuntimeHealthStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** Runtime 健康探测器；只探测平台受控服务地址，不接受 Agent 自填 URL。 */
@Service
public class RuntimeHealthCheckService {

    private final RuntimeRegistryService registryService;
    private final String piRuntimeBaseUrl;
    private final String codeProcessingBaseUrl;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    public RuntimeHealthCheckService(RuntimeRegistryService registryService,
                                     @Value("${platform.pi-runtime.base-url:http://localhost:9010}") String piRuntimeBaseUrl,
                                     @Value("${platform.code-processing.base-url:http://localhost:9000}") String codeProcessingBaseUrl) {
        this.registryService = registryService;
        this.piRuntimeBaseUrl = trimTrailingSlash(piRuntimeBaseUrl);
        this.codeProcessingBaseUrl = trimTrailingSlash(codeProcessingBaseUrl);
    }

    public RuntimeRegistrySummary check(String runtimeCode) {
        String code = runtimeCode == null ? "" : runtimeCode.trim().toUpperCase(java.util.Locale.ROOT);
        String baseUrl = switch (code) {
            case "PI_RUNTIME" -> piRuntimeBaseUrl;
            case "CODEX_CLI", "CLAUDE_CODE_CLI", "OPENCODE_CLI" -> codeProcessingBaseUrl;
            default -> null;
        };
        if (baseUrl == null || baseUrl.isBlank()) {
            return registryService.recordHealth(RuntimeHealth.unknown(code, "该 Runtime 由外部 Gateway 管理，暂未配置平台探测地址"));
        }
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + ("PI_RUNTIME".equals(code) ? "/healthz" : "/health")))
                    .timeout(Duration.ofSeconds(5)).GET().build();
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            RuntimeHealthStatus status = response.statusCode() >= 200 && response.statusCode() < 300
                    ? RuntimeHealthStatus.HEALTHY : RuntimeHealthStatus.UNHEALTHY;
            return registryService.recordHealth(new RuntimeHealth(code, status, "HTTP " + response.statusCode(), java.time.LocalDateTime.now()));
        } catch (Exception exception) {
            return registryService.recordHealth(new RuntimeHealth(code, RuntimeHealthStatus.UNHEALTHY,
                    "健康检查失败: " + exception.getMessage(), java.time.LocalDateTime.now()));
        }
    }

    private String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }
}
