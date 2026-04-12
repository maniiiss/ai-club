package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.UserOperationLogEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.UserOperationLogSummary;
import com.aiclub.platform.operationlog.OperationLogContext;
import com.aiclub.platform.operationlog.OperationLogSupport;
import com.aiclub.platform.repository.UserOperationLogRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.persistence.criteria.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 统一负责操作日志的入库与分页查询。
 */
@Service
@Transactional(readOnly = true)
public class UserOperationLogService {

    private static final Logger log = LoggerFactory.getLogger(UserOperationLogService.class);
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final UserOperationLogRepository userOperationLogRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    public UserOperationLogService(UserOperationLogRepository userOperationLogRepository,
                                   UserRepository userRepository,
                                   ObjectMapper objectMapper) {
        this.userOperationLogRepository = userOperationLogRepository;
        this.userRepository = userRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 请求完成后落库，不影响主业务响应链路。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveOperationLog(HttpServletRequest request,
                                 HttpServletResponse response,
                                 OperationLogContext context,
                                 Exception ex) {
        try {
            UserOperationLogEntity entity = new UserOperationLogEntity();
            fillOperatorSnapshot(entity, context);
            entity.setModuleCode(defaultString(context.getModuleCode()));
            entity.setModuleName(defaultString(context.getModuleName()));
            entity.setActionCode(defaultString(context.getActionCode()));
            entity.setActionName(defaultString(context.getActionName()));
            entity.setBizType(blankToNull(context.getBizType()));
            entity.setBizId(context.getBizId());
            entity.setHttpMethod(defaultString(context.getHttpMethod()));
            entity.setRequestUri(defaultString(context.getRequestUri()));
            entity.setRoutePattern(defaultString(context.getRoutePattern()));
            entity.setPermissionCode(blankToNull(context.getPermissionCode()));
            entity.setOperationStatus(resolveOperationStatus(context, response, ex));
            entity.setResponseStatus(response.getStatus());
            entity.setDurationMs(resolveDurationMs(context));
            entity.setIpAddress(OperationLogSupport.extractIpAddress(request));
            entity.setUserAgent(OperationLogSupport.truncate(request.getHeader("User-Agent"), OperationLogSupport.MAX_USER_AGENT_LENGTH));
            entity.setRequestSnapshot(OperationLogSupport.buildRequestSnapshot(request, context, objectMapper));
            entity.setResultMessage(resolveResultMessage(context, response, ex));
            userOperationLogRepository.save(entity);
        } catch (Exception logException) {
            log.warn("保存操作日志失败: {} {}", request.getMethod(), request.getRequestURI(), logException);
        }
    }

    /**
     * 分页查询操作日志列表。
     */
    public PageResponse<UserOperationLogSummary> pageOperationLogs(int page,
                                                                   int size,
                                                                   String keyword,
                                                                   Long userId,
                                                                   String moduleCode,
                                                                   String operationStatus,
                                                                   String bizType,
                                                                   LocalDateTime startTime,
                                                                   LocalDateTime endTime) {
        Pageable pageable = PageRequest.of(Math.max(page, 1) - 1,
                Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
        Page<UserOperationLogSummary> pageData = userOperationLogRepository.findAll(
                        buildSpecification(keyword, userId, moduleCode, operationStatus, bizType, startTime, endTime),
                        pageable)
                .map(this::toSummary);
        return PageResponse.from(pageData);
    }

    private Specification<UserOperationLogEntity> buildSpecification(String keyword,
                                                                     Long userId,
                                                                     String moduleCode,
                                                                     String operationStatus,
                                                                     String bizType,
                                                                     LocalDateTime startTime,
                                                                     LocalDateTime endTime) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (StringUtils.hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("usernameSnapshot")), pattern),
                        cb.like(cb.lower(root.get("nicknameSnapshot")), pattern),
                        cb.like(cb.lower(root.get("moduleName")), pattern),
                        cb.like(cb.lower(root.get("actionName")), pattern),
                        cb.like(cb.lower(root.get("requestUri")), pattern),
                        cb.like(cb.lower(root.get("routePattern")), pattern),
                        cb.like(cb.lower(root.get("resultMessage")), pattern)
                ));
            }
            if (userId != null) {
                predicates.add(cb.equal(root.join("user", jakarta.persistence.criteria.JoinType.LEFT).get("id"), userId));
            }
            if (StringUtils.hasText(moduleCode)) {
                predicates.add(cb.equal(cb.upper(root.get("moduleCode")), moduleCode.trim().toUpperCase()));
            }
            if (StringUtils.hasText(operationStatus)) {
                predicates.add(cb.equal(cb.upper(root.get("operationStatus")), operationStatus.trim().toUpperCase()));
            }
            if (StringUtils.hasText(bizType)) {
                predicates.add(cb.equal(cb.upper(root.get("bizType")), bizType.trim().toUpperCase()));
            }
            if (startTime != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), startTime));
            }
            if (endTime != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), endTime));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /**
     * 优先使用当前登录态快照，登录/注册等匿名接口则回退到响应里解析到的用户信息。
     */
    private void fillOperatorSnapshot(UserOperationLogEntity entity, OperationLogContext context) {
        AuthContext authContext = AuthContextHolder.get().orElse(null);
        Long actorUserId = authContext != null && authContext.userId() != null ? authContext.userId() : context.getActorUserId();
        String username = authContext != null && StringUtils.hasText(authContext.username())
                ? authContext.username()
                : context.getActorUsername();
        String nickname = authContext != null && StringUtils.hasText(authContext.nickname())
                ? authContext.nickname()
                : context.getActorNickname();

        if (actorUserId != null) {
            UserEntity userEntity = userRepository.findById(actorUserId).orElse(null);
            entity.setUser(userEntity);
            if (userEntity != null) {
                entity.setUsernameSnapshot(defaultString(userEntity.getUsername()));
                entity.setNicknameSnapshot(defaultString(userEntity.getNickname()));
                return;
            }
        }
        entity.setUsernameSnapshot(defaultString(username));
        entity.setNicknameSnapshot(defaultString(nickname));
    }

    private String resolveOperationStatus(OperationLogContext context,
                                          HttpServletResponse response,
                                          Exception ex) {
        if (Boolean.FALSE.equals(context.getResponseSuccess())) {
            return "FAILED";
        }
        if (Boolean.TRUE.equals(context.getResponseSuccess())) {
            return "SUCCESS";
        }
        if (ex != null || response.getStatus() >= 400) {
            return "FAILED";
        }
        return "SUCCESS";
    }

    private String resolveResultMessage(OperationLogContext context,
                                        HttpServletResponse response,
                                        Exception ex) {
        String message = context.getResultMessage();
        if (!StringUtils.hasText(message) && ex != null) {
            message = ex.getMessage();
        }
        if (!StringUtils.hasText(message)) {
            message = response.getStatus() >= 400 ? "Request failed" : "ok";
        }
        return OperationLogSupport.truncate(message, OperationLogSupport.MAX_RESULT_MESSAGE_LENGTH);
    }

    private long resolveDurationMs(OperationLogContext context) {
        return Math.max(0, (System.nanoTime() - context.getStartNanoTime()) / 1_000_000L);
    }

    private UserOperationLogSummary toSummary(UserOperationLogEntity entity) {
        return new UserOperationLogSummary(
                entity.getId(),
                entity.getUser() == null ? null : entity.getUser().getId(),
                entity.getUsernameSnapshot(),
                entity.getNicknameSnapshot(),
                entity.getModuleCode(),
                entity.getModuleName(),
                entity.getActionCode(),
                entity.getActionName(),
                entity.getBizType(),
                entity.getBizId(),
                entity.getHttpMethod(),
                entity.getRequestUri(),
                entity.getRoutePattern(),
                entity.getPermissionCode(),
                entity.getOperationStatus(),
                entity.getResponseStatus(),
                entity.getDurationMs(),
                entity.getIpAddress(),
                entity.getUserAgent(),
                entity.getRequestSnapshot(),
                entity.getResultMessage(),
                entity.getCreatedAt() == null ? null : entity.getCreatedAt().format(TIME_FORMATTER)
        );
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String blankToNull(String value) {
        String result = defaultString(value);
        return result.isEmpty() ? null : result;
    }
}
