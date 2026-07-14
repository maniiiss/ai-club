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
 * 为 Assistant MCP 调用生成和校验会话级 `session_token`。
 * 新版使用短 token + Redis 映射，避免大模型在工具调用时抄错长串 base64。
 */
@Service
public class AssistantMcpSessionTokenService {

    private static final String TOKEN_PREFIX = "hcs_";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final AssistantProperties assistantProperties;

    public AssistantMcpSessionTokenService(StringRedisTemplate stringRedisTemplate,
                                        ObjectMapper objectMapper,
                                        AssistantProperties assistantProperties) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.assistantProperties = assistantProperties;
    }

    /**
     * 为当前聊天会话签发新的 MCP 会话令牌。
     */
    public String issueToken(CurrentUserInfo currentUser, String scopeKey, String clientConversationId) {
        if (currentUser == null || currentUser.id() == null) {
            throw new UnauthorizedException("当前用户信息缺失，无法生成 Assistant 会话令牌");
        }
        Instant expiresAt = Instant.now().plusSeconds(assistantProperties.getGroundingTtlSeconds());
        String token = TOKEN_PREFIX + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        StoredAssistantMcpSession storedSession = new StoredAssistantMcpSession(
                currentUser.id(),
                scopeKey == null ? "" : scopeKey.trim(),
                clientConversationId == null ? "" : clientConversationId.trim(),
                expiresAt.toEpochMilli()
        );
        try {
            stringRedisTemplate.opsForValue().set(
                    buildRedisKey(token),
                    objectMapper.writeValueAsString(storedSession),
                    Duration.ofSeconds(assistantProperties.getGroundingTtlSeconds())
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Assistant MCP 会话令牌序列化失败", exception);
        }
        return token;
    }

    /**
     * 解析并校验 `session_token`。
     */
    public AssistantMcpSessionClaims parseToken(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException(buildRetryHint("Assistant MCP 会话令牌缺失"));
        }
        try {
            String raw = stringRedisTemplate.opsForValue().get(buildRedisKey(token.trim()));
            if (raw == null || raw.isBlank()) {
                throw new UnauthorizedException(buildRetryHint("Assistant MCP 会话令牌格式非法"));
            }
            StoredAssistantMcpSession storedSession = objectMapper.readValue(raw, StoredAssistantMcpSession.class);
            Instant expiresAt = Instant.ofEpochMilli(storedSession.expiresAtEpochMillis());
            if (expiresAt.isBefore(Instant.now())) {
                throw new UnauthorizedException("Assistant MCP 会话令牌已过期，请停止复用旧 token，并等待上层重新发起本轮会话。");
            }
            return new AssistantMcpSessionClaims(
                    storedSession.userId(),
                    storedSession.scopeKey(),
                    storedSession.conversationId(),
                expiresAt
            );
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new UnauthorizedException(buildRetryHint("Assistant MCP 会话令牌无法解析"));
        }
    }

    private String buildRetryHint(String message) {
        return message + "。请直接重试同一个工具调用，并把 `system_session_token` 精确设置为系统提示词里给出的 hcs_ 开头值；不要从用户输入提取 token。";
    }

    private String buildRedisKey(String token) {
        return assistantProperties.getSessionPrefix() + ":mcp-session:" + token;
    }

    /**
     * `session_token` 解码后的会话声明。
     */
    public record AssistantMcpSessionClaims(
            Long userId,
            String scopeKey,
            String conversationId,
            Instant expiresAt
    ) {
    }

    /**
     * Redis 中保存的 MCP 会话映射。
     */
    private record StoredAssistantMcpSession(
            Long userId,
            String scopeKey,
            String conversationId,
            long expiresAtEpochMillis
    ) {
    }
}
