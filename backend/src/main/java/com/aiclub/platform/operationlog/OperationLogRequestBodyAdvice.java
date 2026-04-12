package com.aiclub.platform.operationlog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

/**
 * 复用 Spring 的反序列化结果缓存请求体快照，避免重复读取原始流。
 */
@ControllerAdvice(annotations = Controller.class)
public class OperationLogRequestBodyAdvice extends RequestBodyAdviceAdapter {

    private final ObjectMapper objectMapper;

    public OperationLogRequestBodyAdvice(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean supports(MethodParameter methodParameter,
                            java.lang.reflect.Type targetType,
                            Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object afterBodyRead(Object body,
                                HttpInputMessage inputMessage,
                                MethodParameter parameter,
                                java.lang.reflect.Type targetType,
                                Class<? extends HttpMessageConverter<?>> converterType) {
        if (inputMessage instanceof ServletServerHttpRequest servletServerHttpRequest) {
            Object attribute = servletServerHttpRequest.getServletRequest().getAttribute(OperationLogInterceptor.REQUEST_ATTRIBUTE);
            if (attribute instanceof OperationLogContext context) {
                JsonNode jsonNode = objectMapper.valueToTree(body);
                context.setRequestBody(jsonNode);
            }
        }
        return body;
    }

    @Override
    public Object handleEmptyBody(Object body,
                                  HttpInputMessage inputMessage,
                                  MethodParameter parameter,
                                  java.lang.reflect.Type targetType,
                                  Class<? extends HttpMessageConverter<?>> converterType) {
        return body;
    }
}
