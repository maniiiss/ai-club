package com.aiclub.platform.operationlog;

import com.aiclub.platform.controller.AssistantController;
import com.aiclub.platform.controller.UserController;
import com.aiclub.platform.service.AccessManagementService;
import com.aiclub.platform.service.AuthService;
import com.aiclub.platform.service.DocumentAssetService;
import com.aiclub.platform.service.AssistantAttachmentService;
import com.aiclub.platform.service.AssistantChatService;
import com.aiclub.platform.service.AssistantConversationSessionService;
import com.aiclub.platform.service.AssistantHindsightMemoryService;
import com.aiclub.platform.service.UserOperationLogService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * 覆盖操作日志拦截器的跳过规则与默认元数据解析行为。
 */
class OperationLogInterceptorTests {

    /**
     * Assistant 专用审计已单独存在，通用操作日志应直接跳过，避免重复记账。
     */
    @Test
    void shouldSkipAssistantControllerWhenClassAnnotationMarksSkip() throws Exception {
        OperationLogInterceptor interceptor = new OperationLogInterceptor(mock(UserOperationLogService.class));
        AssistantController assistantController = new AssistantController(
                mock(AssistantChatService.class),
                mock(AssistantConversationSessionService.class),
                mock(AssistantAttachmentService.class),
                mock(AssistantHindsightMemoryService.class),
                mock(AuthService.class),
                mock(DocumentAssetService.class),
                new ObjectMapper()
        );
        HandlerMethod handlerMethod = new HandlerMethod(
                assistantController,
                AssistantController.class.getMethod("chat", Long.class, com.aiclub.platform.dto.request.AssistantSessionChatRequest.class)
        );
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/assistant/sessions/1/chat");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/assistant/sessions/{sessionId}/chat");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean proceed = interceptor.preHandle(request, response, handlerMethod);

        assertThat(proceed).isTrue();
        assertThat(request.getAttribute(OperationLogInterceptor.REQUEST_ATTRIBUTE)).isNull();
    }

    /**
     * 常规写接口应建立上下文，并自动提取权限码与常见路径主键。
     */
    @Test
    void shouldCreateContextForWriteEndpointAndExtractBizId() throws Exception {
        OperationLogInterceptor interceptor = new OperationLogInterceptor(mock(UserOperationLogService.class));
        UserController userController = new UserController(mock(AccessManagementService.class));
        HandlerMethod handlerMethod = new HandlerMethod(
                userController,
                UserController.class.getMethod("delete", Long.class)
        );
        MockHttpServletRequest request = new MockHttpServletRequest("DELETE", "/api/users/15");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/users/{id}");
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("id", "15"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean proceed = interceptor.preHandle(request, response, handlerMethod);
        Object attribute = request.getAttribute(OperationLogInterceptor.REQUEST_ATTRIBUTE);

        assertThat(proceed).isTrue();
        assertThat(attribute).isInstanceOf(OperationLogContext.class);
        OperationLogContext context = (OperationLogContext) attribute;
        assertThat(context.getBizId()).isEqualTo(15L);
        assertThat(context.getBizType()).isEqualTo("USER");
        assertThat(context.getPermissionCode()).isEqualTo("system:user:manage");
        assertThat(context.getModuleCode()).isEqualTo("USER");
    }
}
