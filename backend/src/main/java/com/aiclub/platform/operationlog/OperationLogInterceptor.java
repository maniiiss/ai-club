package com.aiclub.platform.operationlog;

import com.aiclub.platform.annotation.OperationLog;
import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.service.UserOperationLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import java.util.Collections;
import java.util.Map;

/**
 * 在鉴权之后为写接口建立操作日志上下文，并在请求完成后统一落库。
 */
@Component
public class OperationLogInterceptor implements HandlerInterceptor {

    /**
     * 请求属性键，供拦截器与 Advice 共享上下文。
     */
    public static final String REQUEST_ATTRIBUTE = OperationLogInterceptor.class.getName() + ".CONTEXT";

    private final UserOperationLogService userOperationLogService;

    public OperationLogInterceptor(UserOperationLogService userOperationLogService) {
        this.userOperationLogService = userOperationLogService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }
        if (!OperationLogSupport.isWriteMethod(request.getMethod())) {
            return true;
        }

        ResolvedMetadata metadata = resolveMetadata(handlerMethod, request);
        if (metadata.skip()) {
            return true;
        }

        OperationLogContext context = new OperationLogContext(
                System.nanoTime(),
                request.getMethod(),
                OperationLogSupport.truncate(request.getRequestURI(), 255),
                OperationLogSupport.resolveRoutePattern(request),
                metadata.moduleCode(),
                metadata.moduleName(),
                metadata.actionCode(),
                metadata.actionName(),
                metadata.bizType(),
                metadata.bizId(),
                metadata.permissionCode()
        );
        request.setAttribute(REQUEST_ATTRIBUTE, context);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request,
                                HttpServletResponse response,
                                Object handler,
                                Exception ex) {
        Object attribute = request.getAttribute(REQUEST_ATTRIBUTE);
        if (!(attribute instanceof OperationLogContext context)) {
            return;
        }
        userOperationLogService.saveOperationLog(request, response, context, ex);
    }

    /**
     * 统一解析注解与兜底规则，避免模块、动作、业务对象在各处重复拼接。
     */
    private ResolvedMetadata resolveMetadata(HandlerMethod handlerMethod, HttpServletRequest request) {
        OperationLog classAnnotation = handlerMethod.getBeanType().getAnnotation(OperationLog.class);
        OperationLog methodAnnotation = handlerMethod.getMethodAnnotation(OperationLog.class);
        boolean skip = (classAnnotation != null && classAnnotation.skip())
                || (methodAnnotation != null && methodAnnotation.skip());

        String routePattern = OperationLogSupport.resolveRoutePattern(request);
        Map<String, String> pathVariables = resolvePathVariables(request);
        String configuredBizType = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.bizType(),
                classAnnotation == null ? null : classAnnotation.bizType()
        );
        String configuredBizIdParam = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.bizIdParam(),
                classAnnotation == null ? null : classAnnotation.bizIdParam()
        );
        OperationLogSupport.ResolvedBizTarget bizTarget = OperationLogSupport.resolveBizTarget(
                pathVariables,
                routePattern,
                configuredBizType,
                configuredBizIdParam
        );

        String moduleCode = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.moduleCode(),
                classAnnotation == null ? null : classAnnotation.moduleCode(),
                OperationLogSupport.deriveModuleCode(handlerMethod, request.getRequestURI())
        );
        String moduleName = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.moduleName(),
                classAnnotation == null ? null : classAnnotation.moduleName(),
                OperationLogSupport.deriveModuleName(moduleCode, handlerMethod, request.getRequestURI())
        );
        String actionCode = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.actionCode(),
                classAnnotation == null ? null : classAnnotation.actionCode(),
                OperationLogSupport.deriveActionCode(request.getMethod(), routePattern, handlerMethod.getMethod().getName())
        );
        String actionName = firstNonBlank(
                methodAnnotation == null ? null : methodAnnotation.actionName(),
                classAnnotation == null ? null : classAnnotation.actionName(),
                OperationLogSupport.deriveActionName(request.getMethod(), routePattern, handlerMethod.getMethod().getName())
        );

        RequirePermission requirePermission = resolveRequirePermission(handlerMethod);
        String permissionCode = requirePermission == null ? null : requirePermission.value();
        return new ResolvedMetadata(
                skip,
                OperationLogSupport.truncate(moduleCode, OperationLogSupport.MAX_MODULE_CODE_LENGTH),
                OperationLogSupport.truncate(moduleName, OperationLogSupport.MAX_MODULE_NAME_LENGTH),
                OperationLogSupport.truncate(actionCode, OperationLogSupport.MAX_ACTION_CODE_LENGTH),
                OperationLogSupport.truncate(actionName, OperationLogSupport.MAX_ACTION_NAME_LENGTH),
                OperationLogSupport.truncate(bizTarget.bizType(), 80),
                bizTarget.bizId(),
                OperationLogSupport.truncate(permissionCode, 100)
        );
    }

    private RequirePermission resolveRequirePermission(HandlerMethod handlerMethod) {
        RequirePermission methodPermission = handlerMethod.getMethodAnnotation(RequirePermission.class);
        if (methodPermission != null) {
            return methodPermission;
        }
        return handlerMethod.getBeanType().getAnnotation(RequirePermission.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> resolvePathVariables(HttpServletRequest request) {
        Object attribute = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (attribute instanceof Map<?, ?> variables) {
            return (Map<String, String>) variables;
        }
        return Collections.emptyMap();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    /**
     * 拦截阶段解析出的元数据快照。
     */
    private record ResolvedMetadata(boolean skip,
                                    String moduleCode,
                                    String moduleName,
                                    String actionCode,
                                    String actionName,
                                    String bizType,
                                    Long bizId,
                                    String permissionCode) {
    }
}
