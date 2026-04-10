package com.aiclub.platform.security;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@Service
public class LoginSessionStore {

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final String sessionKeyPrefix;
    private final String logoutKeyPrefix;

    public LoginSessionStore(StringRedisTemplate stringRedisTemplate,
                             ObjectMapper objectMapper,
                             @Value("${platform.security.session-key-prefix}") String sessionKeyPrefix) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.sessionKeyPrefix = sessionKeyPrefix;
        this.logoutKeyPrefix = sessionKeyPrefix + "logout:";
    }

    public void save(String token, CurrentUserInfo currentUserInfo, Instant expiresAt) {
        LoginSession loginSession = LoginSession.fromCurrentUserInfo(currentUserInfo);
        try {
            String key = buildKey(token);
            String value = objectMapper.writeValueAsString(loginSession);
            Duration ttl = Duration.between(Instant.now(), expiresAt);
            if (ttl.isNegative() || ttl.isZero()) {
                ttl = Duration.ofSeconds(1);
            }
            stringRedisTemplate.opsForValue().set(key, value, ttl);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize login session", ex);
        }
    }

    public Optional<LoginSession> get(String token) {
        String value = stringRedisTemplate.opsForValue().get(buildKey(token));
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(value, LoginSession.class));
        } catch (JsonProcessingException ex) {
            stringRedisTemplate.delete(buildKey(token));
            return Optional.empty();
        }
    }

    public void delete(String token) {
        stringRedisTemplate.delete(buildKey(token));
    }

    public void markLoggedOut(String token, Instant expiresAt) {
        Duration ttl = Duration.between(Instant.now(), expiresAt);
        if (ttl.isNegative() || ttl.isZero()) {
            ttl = Duration.ofSeconds(1);
        }
        stringRedisTemplate.opsForValue().set(buildLogoutKey(token), "1", ttl);
        stringRedisTemplate.delete(buildKey(token));
    }

    public boolean isLoggedOut(String token) {
        return Boolean.TRUE.equals(stringRedisTemplate.hasKey(buildLogoutKey(token)));
    }

    private String buildKey(String token) {
        return sessionKeyPrefix + token;
    }

    private String buildLogoutKey(String token) {
        return logoutKeyPrefix + token;
    }
}
