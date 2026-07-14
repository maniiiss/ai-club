package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.RuntimeEventEntity;
import com.aiclub.platform.dto.request.RuntimeEventRequest;
import com.aiclub.platform.repository.RuntimeEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.Locale;

/**
 * Runtime 事件接收器。
 * 先做事件幂等落库，再由后续执行中心/聊天室桥接消费，确保 Runtime 重试不会重复推进业务状态。
 */
@Service
public class RuntimeEventIngestService {

    private final RuntimeEventRepository repository;
    private final ObjectMapper objectMapper;
    private final RuntimeExecutionEventBridgeService eventBridge;

    public RuntimeEventIngestService(RuntimeEventRepository repository, ObjectMapper objectMapper) {
        this(repository, objectMapper, null);
    }

    @Autowired
    public RuntimeEventIngestService(RuntimeEventRepository repository,
                                     ObjectMapper objectMapper,
                                     RuntimeExecutionEventBridgeService eventBridge) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.eventBridge = eventBridge;
    }

    @Transactional
    public boolean ingest(RuntimeEventRequest request) {
        if (request.sequence() < 1) {
            throw new IllegalArgumentException("Runtime event sequence must be positive");
        }
        String eventKey = request.runId().trim() + ":" + request.sequence();
        if (repository.existsById(eventKey)) return false;
        RuntimeEventEntity entity = new RuntimeEventEntity();
        entity.setEventKey(eventKey);
        entity.setRunId(request.runId());
        entity.setSessionId(request.sessionId());
        entity.setSequence(request.sequence());
        entity.setEventType(request.eventType().trim().toUpperCase(Locale.ROOT));
        try {
            entity.setPayloadJson(objectMapper.writeValueAsString(request.payload() == null ? java.util.Map.of() : request.payload()));
        } catch (Exception exception) {
            throw new IllegalArgumentException("Runtime 事件 payload 序列化失败", exception);
        }
        repository.save(entity);
        if (eventBridge != null) {
            eventBridge.bridge(entity);
        }
        return true;
    }
}
