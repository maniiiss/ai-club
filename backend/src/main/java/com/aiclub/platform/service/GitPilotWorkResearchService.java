package com.aiclub.platform.service;

import com.aiclub.platform.config.GitPilotWorkResearchProperties;
import com.aiclub.platform.dto.cli.CliDtos;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 受控的 Work 联网研究出口：只调用管理员配置的搜索端点，用户不能提交 URL 或供应商密钥。
 */
@Service
public class GitPilotWorkResearchService {
    private static final Logger log = LoggerFactory.getLogger(GitPilotWorkResearchService.class);
    private static final int MAX_QUERY_LENGTH = 600;
    private final GitPilotWorkResearchProperties properties;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public GitPilotWorkResearchService(GitPilotWorkResearchProperties properties,
                                       StringRedisTemplate redis,
                                       ObjectMapper objectMapper) {
        this.properties = properties;
        this.redis = redis;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(properties.timeoutSeconds()).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(properties.timeoutSeconds()).toMillis());
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    public List<CliDtos.WorkResearchSource> search(Long userId, String query) {
        String normalized = query == null ? "" : query.trim().replaceAll("\\s+", " ");
        if (normalized.isBlank() || normalized.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException("研究查询不能为空且不得超过 " + MAX_QUERY_LENGTH + " 个字符");
        }
        if (!properties.enabled() || properties.endpoint().isBlank() || properties.apiKey().isBlank()) {
            throw new IllegalStateException("Work 联网研究尚未由管理员配置");
        }
        String rateKey = "gitpilot:work:research:" + userId;
        Boolean accepted = redis.opsForValue().setIfAbsent(rateKey, "1", Duration.ofSeconds(3));
        if (Boolean.FALSE.equals(accepted)) throw new IllegalStateException("研究请求过于频繁，请稍后再试");
        try {
            String body = restClient.post().uri(properties.endpoint())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("api_key", properties.apiKey(), "query", normalized, "search_depth", "basic", "max_results", properties.maxResults(), "include_answer", false))
                    .retrieve().body(String.class);
            List<CliDtos.WorkResearchSource> sources = parse(body);
            log.info("GitPilot Work research completed: userId={}, resultCount={}", userId, sources.size());
            return sources;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            log.warn("GitPilot Work research failed: userId={}, type={}", userId, exception.getClass().getSimpleName());
            throw new IllegalStateException("联网研究服务暂时不可用，请稍后重试");
        }
    }

    private List<CliDtos.WorkResearchSource> parse(String body) {
        try {
            JsonNode results = objectMapper.readTree(body == null ? "{}" : body).path("results");
            List<CliDtos.WorkResearchSource> sources = new ArrayList<>();
            if (!results.isArray()) return sources;
            for (JsonNode item : results) {
                String url = item.path("url").asText("").trim();
                if (!url.startsWith("https://") && !url.startsWith("http://")) continue;
                String title = truncate(item.path("title").asText("未命名来源"), 180);
                String snippet = truncate(item.path("content").asText(""), 1600);
                sources.add(new CliDtos.WorkResearchSource(UUID.randomUUID().toString(), title, url, snippet, item.path("published_date").asText(null)));
                if (sources.size() >= properties.maxResults()) break;
            }
            return sources;
        } catch (Exception exception) {
            throw new IllegalStateException("联网研究服务返回了无效数据");
        }
    }

    private String truncate(String value, int max) {
        String normalized = value == null ? "" : value.trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }
}
