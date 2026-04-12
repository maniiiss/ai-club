package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformToolAuditEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.dto.PlatformToolRequest;
import com.aiclub.platform.dto.PlatformToolResult;
import com.aiclub.platform.repository.PlatformToolAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台工具执行审计服务。
 */
@Service
public class ToolExecutionAuditService {

    private final PlatformToolAuditRepository platformToolAuditRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public ToolExecutionAuditService(PlatformToolAuditRepository platformToolAuditRepository,
                                     UserRepository userRepository,
                                     ObjectMapper objectMapper) {
        this.platformToolAuditRepository = platformToolAuditRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 工具审计需要脱离外层只读事务单独提交。
     * 这样 Hermes 的只读查询工具既不会被只读事务拦住，也能在工具执行失败时保留审计记录。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public PlatformToolAuditEntity createAudit(PlatformToolDefinition definition, PlatformToolRequest request) {
        PlatformToolAuditEntity entity = new PlatformToolAuditEntity();
        entity.setToolCode(definition.code());
        entity.setToolName(definition.name());
        entity.setTriggerSource(request.triggerSource() == null ? "HERMES" : request.triggerSource());
        entity.setScopeKey(request.scopeKey());
        entity.setProjectId(request.projectId());
        entity.setBizType(request.bizType());
        entity.setBizId(request.bizId());
        entity.setRequestSummary(abbreviate(toJson(request.payload()), 1000));
        AuthContextHolder.get()
                .map(authContext -> userRepository.findById(authContext.userId()).orElse(null))
                .ifPresent(entity::setUser);
        entity.markRunning();
        return platformToolAuditRepository.save(entity);
    }

    /**
     * 成功结果独立提交，避免外层业务后续异常导致审计丢失。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finishSuccess(PlatformToolAuditEntity entity, PlatformToolResult result) {
        entity.finish("SUCCESS", abbreviate(result.summary(), 1000), null);
        platformToolAuditRepository.save(entity);
    }

    /**
     * 失败审计同样独立提交，确保错误现场可追溯。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finishFailure(PlatformToolAuditEntity entity, Exception exception) {
        entity.finish("FAILED", "", abbreviate(exception == null ? "未知错误" : exception.getMessage(), 1000));
        platformToolAuditRepository.save(entity);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return String.valueOf(value);
        }
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }
}
