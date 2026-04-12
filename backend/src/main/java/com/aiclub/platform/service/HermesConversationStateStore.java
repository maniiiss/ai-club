package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesConversationState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * 将 Hermes 会话态持久化到 Redis。
 * 这里统一保存 transcript、待确认卡片、grounding 和 MCP 会话令牌。
 */
@Service
public class HermesConversationStateStore {

    /**
     * 会话态存储版本。
     * 当会话编排策略发生不兼容变更时，提升版本即可自动隔离旧 transcript。
     */
    private static final String STATE_VERSION = "v3";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final HermesProperties hermesProperties;

    public HermesConversationStateStore(StringRedisTemplate stringRedisTemplate,
                                        ObjectMapper objectMapper,
                                        HermesProperties hermesProperties) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.hermesProperties = hermesProperties;
    }

    /**
     * 按 scopeKey 和会话 ID 读取会话态。
     */
    public Optional<HermesConversationState> load(String scopeKey, String clientConversationId) {
        String raw = stringRedisTemplate.opsForValue().get(buildKey(scopeKey, clientConversationId));
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(raw, HermesConversationState.class));
        } catch (JsonProcessingException exception) {
            stringRedisTemplate.delete(buildKey(scopeKey, clientConversationId));
            return Optional.empty();
        }
    }

    /**
     * 保存最新会话态，并刷新 TTL。
     */
    public HermesConversationState save(HermesConversationState state) {
        if (state == null) {
            throw new IllegalArgumentException("Hermes 会话态不能为空");
        }
        try {
            stringRedisTemplate.opsForValue().set(
                    buildKey(state.scopeKey(), state.clientConversationId()),
                    objectMapper.writeValueAsString(state),
                    Duration.ofSeconds(hermesProperties.getGroundingTtlSeconds())
            );
            return state;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Hermes 会话态序列化失败", exception);
        }
    }

    private String buildKey(String scopeKey, String clientConversationId) {
        return hermesProperties.getSessionPrefix()
                + ":conversation-state:"
                + STATE_VERSION
                + ":"
                + (scopeKey == null ? "" : scopeKey.trim())
                + ":"
                + (clientConversationId == null ? "" : clientConversationId.trim());
    }
}
