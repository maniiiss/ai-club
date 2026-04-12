package com.aiclub.platform.operationlog;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * 统一从控制器返回值里提取操作结果状态和结果消息。
 */
@ControllerAdvice(annotations = Controller.class)
public class OperationLogResponseBodyAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body,
                                  MethodParameter returnType,
                                  MediaType selectedContentType,
                                  Class<? extends HttpMessageConverter<?>> selectedConverterType,
                                  ServerHttpRequest request,
                                  ServerHttpResponse response) {
        if (!(request instanceof ServletServerHttpRequest servletServerHttpRequest)) {
            return body;
        }
        Object attribute = servletServerHttpRequest.getServletRequest().getAttribute(OperationLogInterceptor.REQUEST_ATTRIBUTE);
        if (!(attribute instanceof OperationLogContext context)) {
            return body;
        }
        if (!(body instanceof ApiResponse<?> apiResponse)) {
            return body;
        }
        context.setResponseSuccess(apiResponse.success());
        context.setResultMessage(apiResponse.message());
        AuthContext authContext = AuthContextHolder.get().orElse(null);
        OperationLogSupport.ActorSnapshot actorSnapshot = OperationLogSupport.resolveActorSnapshot(apiResponse, authContext);
        if (actorSnapshot.userId() != null) {
            context.setActorUserId(actorSnapshot.userId());
        }
        if (actorSnapshot.username() != null) {
            context.setActorUsername(actorSnapshot.username());
        }
        if (actorSnapshot.nickname() != null) {
            context.setActorNickname(actorSnapshot.nickname());
        }
        return body;
    }
}
