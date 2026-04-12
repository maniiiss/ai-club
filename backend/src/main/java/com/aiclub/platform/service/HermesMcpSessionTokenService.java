package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.exception.UnauthorizedException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Duration;
import java.util.UUID;

/**
 * 为 Hermes MCP 调用生成和校验会话级 `session_token`。
 * 新版使用短 token + Redis 映射，避免大模型在工具调用时抄错长串 base64。
 */
@Service
public class HermesMcpSessionTokenService {

    private static final String TOKEN_PREFIX = "hcs_";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final HermesProperties hermesProperties;

    public HermesMcpSessionTokenService(StringRedisTemplate stringRedisTemplate,
                                        ObjectMapper objectMapper,
                                        HermesProperties hermesProperties) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.hermesProperties = hermesProperties;
    }

    /**
     * 为当前聊天会话签发新的 MCP 会话令牌。
     */
    public String issueToken(CurrentUserInfo currentUser, String scopeKey, String clientConversationId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new UnauthorizedException("当前用户信息缺失，无法生成 Hermes 会话令牌");
        }
        Instant expiresAt = Instant.now().plusSeconds(hermesProperties.getGroundingTtlSeconds());
        String token = TOKEN_PREFIX + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        StoredHermesMcpSession storedSession = new StoredHermesMcpSession(
                currentUser.id(),
                scopeKey == null ? "" : scopeKey.trim(),
                clientConversationId == null ? "" : clientConversationId.trim(),
                expiresAt.toEpochMilli()
        );
        try {
            stringRedisTemplate.opsForValue().set(
                    buildRedisKey(token),
                    objectMapper.writeValueAsString(storedSession),
                    Duration.ofSeconds(hermesProperties.getGroundingTtlSeconds())
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Hermes MCP 会话令牌序列化失败", exception);
        }
        return token;
    }

    /**
     * 解析并校验 `session_token`。
     */
    public HermesMcpSessionClaims parseToken(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException("Hermes MCP 会话令牌缺失");
        }
        try {
            String raw = stringRedisTemplate.opsForValue().get(buildRedisKey(token.trim()));
            if (raw == null || raw.isBlank()) {
                throw new UnauthorizedException("Hermes MCP 会话令牌格式非法");
            }
            StoredHermesMcpSession storedSession = objectMapper.readValue(raw, StoredHermesMcpSession.class);
            Instant expiresAt = Instant.ofEpochMilli(storedSession.expiresAtEpochMillis());
            if (expiresAt.isBefore(Instant.now())) {
                throw new UnauthorizedException("Hermes MCP 会话令牌已过期");
            }
            return new HermesMcpSessionClaims(
                    storedSession.userId(),
                    storedSession.scopeKey(),
                    storedSession.conversationId(),
                    expiresAt
            );
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new UnauthorizedException("Hermes MCP 会话令牌无法解析");
        }
    }

    private String buildRedisKey(String token) {
        return hermesProperties.getSessionPrefix() + ":mcp-session:" + token;
    }

    /**
     * `session_token` 解码后的会话声明。
     */
    public record HermesMcpSessionClaims(
            Long userId,
            String scopeKey,
            String conversationId,
            Instant expiresAt
    ) {
    }

    /**
     * Redis 中保存的 MCP 会话映射。
     */
    private record StoredHermesMcpSession(
            Long userId,
            String scopeKey,
            String conversationId,
            long expiresAtEpochMillis
    ) {
    }
}
