package com.aiclub.platform.security;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * 平台侧 Yaade 代理会话存储。
 * iframe 请求不会携带平台 Bearer Token，因此需要单独的 HttpOnly cookie + Redis 会话桥接。
 */
@Service
public class YaadeProxySessionStore {

    public static final String COOKIE_NAME = "AI_CLUB_YAADE_PROXY";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final String keyPrefix;

    public YaadeProxySessionStore(StringRedisTemplate stringRedisTemplate,
                                  ObjectMapper objectMapper,
                                  @Value("${platform.security.session-key-prefix}") String sessionKeyPrefix) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.keyPrefix = sessionKeyPrefix + "yaade:proxy:";
    }

    public void save(String sessionId, ProxySessionSnapshot snapshot, Duration ttl) {
        try {
            Duration safeTtl = ttl == null || ttl.isZero() || ttl.isNegative()
                    ? Duration.ofMinutes(30)
                    : ttl;
            stringRedisTemplate.opsForValue().set(buildKey(sessionId), objectMapper.writeValueAsString(snapshot), safeTtl);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("序列化 Yaade 代理会话失败", ex);
        }
    }

    public Optional<ProxySessionSnapshot> get(String sessionId) {
        String value = stringRedisTemplate.opsForValue().get(buildKey(sessionId));
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(value, ProxySessionSnapshot.class));
        } catch (JsonProcessingException ex) {
            stringRedisTemplate.delete(buildKey(sessionId));
            return Optional.empty();
        }
    }

    public void delete(String sessionId) {
        stringRedisTemplate.delete(buildKey(sessionId));
    }

    private String buildKey(String sessionId) {
        return keyPrefix + sessionId;
    }

    public record ProxySessionSnapshot(
            Long userId,
            String yaadeUsername,
            String remoteCookieHeader
    ) {
    }
}
