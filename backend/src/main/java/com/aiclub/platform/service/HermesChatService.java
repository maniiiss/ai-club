package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.HermesChatAuditEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesChatResponse;
import com.aiclub.platform.dto.HermesStreamDelta;
import com.aiclub.platform.dto.HermesStreamDone;
import com.aiclub.platform.dto.HermesStreamError;
import com.aiclub.platform.dto.HermesStreamMeta;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.repository.HermesChatAuditRepository;
import com.aiclub.platform.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDateTime;

/**
 * 编排 Hermes 顶部问答的完整流程：上下文装配、流式转发和轻量审计。
 */
@Service
public class HermesChatService {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final HermesProperties hermesProperties;
    private final HermesContextAssembler hermesContextAssembler;
    private final HermesPromptBuilder hermesPromptBuilder;
    private final HermesGatewayService hermesGatewayService;
    private final HermesChatAuditRepository hermesChatAuditRepository;
    private final ObjectMapper objectMapper;

    public HermesChatService(AuthService authService,
                             UserRepository userRepository,
                             HermesProperties hermesProperties,
                             HermesContextAssembler hermesContextAssembler,
                             HermesPromptBuilder hermesPromptBuilder,
                             HermesGatewayService hermesGatewayService,
                             HermesChatAuditRepository hermesChatAuditRepository,
                             ObjectMapper objectMapper) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.hermesProperties = hermesProperties;
        this.hermesContextAssembler = hermesContextAssembler;
        this.hermesPromptBuilder = hermesPromptBuilder;
        this.hermesGatewayService = hermesGatewayService;
        this.hermesChatAuditRepository = hermesChatAuditRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 直接以标准 SSE 文本格式写出事件，避免 SseEmitter 在当前链路上出现连接被重置的问题。
     */
    public StreamingResponseBody streamChat(HermesChatRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(request, currentUser);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), request.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, request, context, scopeKey);

        return outputStream -> {
            try {
                writeEvent(outputStream, "meta", new HermesStreamMeta(scopeKey, context.roleName(), context.references(), context.suggestions()));
                HermesPromptBuilder.HermesPrompt prompt = hermesPromptBuilder.build(currentUser, context, request);
                HermesGatewayService.HermesGatewayResult result = hermesGatewayService.streamChatCompletions(
                        prompt,
                        deltaText -> {
                            try {
                                writeEvent(outputStream, "delta", new HermesStreamDelta(deltaText));
                            } catch (IOException exception) {
                                throw new IllegalStateException("Hermes 文本分片发送失败", exception);
                            }
                        }
                );
                finishSuccess(outputStream, audit, scopeKey, context, result);
            } catch (Exception exception) {
                finishFailure(outputStream, audit, exception);
            }
        };
    }

    /**
     * Hermes 当前 Responses API 实际返回完整 JSON，因此额外提供普通问答接口给前端稳定消费。
     */
    public HermesChatResponse chat(HermesChatRequest request) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesContextAssembler.HermesConversationContext context = hermesContextAssembler.assemble(request, currentUser);
        String scopeKey = resolveScopeKey(currentUser.id(), context.projectId(), request.clientConversationId());
        HermesChatAuditEntity audit = createAudit(currentUser, request, context, scopeKey);

        try {
            HermesPromptBuilder.HermesPrompt prompt = hermesPromptBuilder.build(currentUser, context, request);
            HermesGatewayService.HermesGatewayResult result = hermesGatewayService.streamChat(scopeKey, prompt, deltaText -> {
                // 当前非流式接口直接等待完整结果，不需要向调用方回放增量。
            });
            audit.setStatus("SUCCESS");
            audit.setResponseSummary(abbreviate(result.content(), 1000));
            audit.setHermesResponseId(result.responseId());
            audit.setFinishedAt(LocalDateTime.now());
            hermesChatAuditRepository.save(audit);
            return new HermesChatResponse(
                    scopeKey,
                    context.roleName(),
                    defaultString(result.content()),
                    context.references(),
                    context.suggestions()
            );
        } catch (Exception exception) {
            audit.setStatus("FAILED");
            audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
            audit.setFinishedAt(LocalDateTime.now());
            hermesChatAuditRepository.save(audit);
            throw exception;
        }
    }

    /**
     * 首个 meta 事件提前把 scopeKey、角色和建议追问发给前端，方便界面立即进入正确状态。
     */
    private void finishSuccess(OutputStream outputStream,
                               HermesChatAuditEntity audit,
                               String scopeKey,
                               HermesContextAssembler.HermesConversationContext context,
                               HermesGatewayService.HermesGatewayResult result) {
        audit.setStatus("SUCCESS");
        audit.setResponseSummary(abbreviate(result.content(), 1000));
        audit.setHermesResponseId(result.responseId());
        audit.setFinishedAt(LocalDateTime.now());
        hermesChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "done", new HermesStreamDone(
                    scopeKey,
                    context.roleName(),
                    defaultString(result.content()),
                    context.references(),
                    context.suggestions()
            ));
        } catch (IOException exception) {
            throw new IllegalStateException("Hermes 完成事件发送失败", exception);
        }
    }

    /**
     * 失败时统一发 error 事件，并把错误摘要沉淀到轻量审计日志中。
     */
    private void finishFailure(OutputStream outputStream, HermesChatAuditEntity audit, Exception exception) {
        audit.setStatus("FAILED");
        audit.setErrorMessage(abbreviate(resolveErrorMessage(exception), 1000));
        audit.setFinishedAt(LocalDateTime.now());
        hermesChatAuditRepository.save(audit);

        try {
            writeEvent(outputStream, "error", new HermesStreamError(resolveErrorMessage(exception)));
        } catch (IOException sendException) {
            throw new IllegalStateException("Hermes 错误事件发送失败", sendException);
        }
    }

    private void writeEvent(OutputStream outputStream, String eventName, Object payload) throws IOException {
        String json = objectMapper.writeValueAsString(payload);
        String ssePayload = "event:" + eventName + "\n" + "data:" + json + "\n\n";
        outputStream.write(ssePayload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        outputStream.flush();
    }

    private HermesChatAuditEntity createAudit(CurrentUserInfo currentUser,
                                              HermesChatRequest request,
                                              HermesContextAssembler.HermesConversationContext context,
                                              String scopeKey) {
        HermesChatAuditEntity entity = new HermesChatAuditEntity();
        UserEntity auditUser = currentUser == null || currentUser.id() == null
                ? null
                : userRepository.findById(currentUser.id()).orElse(null);
        entity.setUser(auditUser);
        entity.setScopeKey(scopeKey);
        entity.setRouteName(request.routeName().trim());
        entity.setProjectId(context.projectId());
        entity.setTaskId(context.taskId());
        entity.setIterationId(request.iterationId());
        entity.setPlanId(request.planId());
        entity.setRoleName(context.roleName());
        entity.setQuestionSummary(abbreviate(request.question(), 500));
        entity.setStatus("RUNNING");
        return hermesChatAuditRepository.save(entity);
    }

    /**
     * 会话键同时承担两层职责：
     * 1. 保持用户和项目隔离
     * 2. 通过浏览器会话级 conversationId 限制单个对话历史无限膨胀
     */
    private String resolveScopeKey(Long userId, Long projectId, String clientConversationId) {
        String conversationSuffix = sanitizeConversationId(clientConversationId);
        if (projectId != null) {
            if (conversationSuffix != null) {
                return hermesProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId + ":conversation:" + conversationSuffix;
            }
            return hermesProperties.getSessionPrefix() + ":project:" + projectId + ":user:" + userId;
        }
        if (conversationSuffix != null) {
            return hermesProperties.getSessionPrefix() + ":global:user:" + userId + ":conversation:" + conversationSuffix;
        }
        return hermesProperties.getSessionPrefix() + ":global:user:" + userId;
    }

    private String sanitizeConversationId(String clientConversationId) {
        if (clientConversationId == null || clientConversationId.isBlank()) {
            return null;
        }
        return clientConversationId.trim().replaceAll("[^a-zA-Z0-9:_-]", "");
    }

    private String resolveErrorMessage(Exception exception) {
        String message = exception == null ? null : exception.getMessage();
        if (message == null || message.isBlank()) {
            return "Hermes 助手暂时不可用，请稍后再试";
        }
        return abbreviate(message, 500);
    }

    private String abbreviate(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
