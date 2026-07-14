package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantGroundingState;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Assistant grounding 状态的 Redis 存储。
 * 这里只保存会话级对象锚点，不承担长期审计或历史对话回放职责。
 */
@Service
public class AssistantGroundingStateStore {

    private static final String GROUNDING_KEY_PREFIX = "ai-club:hermes:grounding:";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final AssistantProperties assistantProperties;

    public AssistantGroundingStateStore(StringRedisTemplate stringRedisTemplate,
                                     ObjectMapper objectMapper,
                                     AssistantProperties assistantProperties) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
        this.assistantProperties = assistantProperties;
    }

    /**
     * 读取指定对话范围的 grounding 状态。
     * 如果 Redis 中不存在或内容损坏，则回退为空状态。
     */
    public AssistantGroundingState load(String scopeKey) {
        if (scopeKey == null || scopeKey.isBlank()) {
            return AssistantGroundingState.empty();
        }
        String value = stringRedisTemplate.opsForValue().get(buildKey(scopeKey));
        if (value == null || value.isBlank()) {
            return AssistantGroundingState.empty();
        }
        try {
            return objectMapper.readValue(value, AssistantGroundingState.class);
        } catch (JsonProcessingException exception) {
            stringRedisTemplate.delete(buildKey(scopeKey));
            return AssistantGroundingState.empty();
        }
    }

    /**
     * 将最新 grounding 状态写回 Redis，并刷新 TTL，保证多轮对话可以命中最近对象。
     */
    public void save(String scopeKey, AssistantGroundingState state) {
        if (scopeKey == null || scopeKey.isBlank() || state == null) {
            return;
        }
        try {
            String value = objectMapper.writeValueAsString(state);
            stringRedisTemplate.opsForValue().set(
                    buildKey(scopeKey),
                    value,
                    Duration.ofSeconds(assistantProperties.getGroundingTtlSeconds())
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Assistant grounding 状态序列化失败", exception);
        }
    }

    private String buildKey(String scopeKey) {
        return GROUNDING_KEY_PREFIX + scopeKey;
    }
}
