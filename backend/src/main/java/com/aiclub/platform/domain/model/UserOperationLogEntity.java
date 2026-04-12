package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 用户操作日志实体，用于统一存储后台写操作审计记录。
 */
@Entity
@Table(name = "user_operation_log")
public class UserOperationLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 发起本次操作的登录用户。
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private UserEntity user;

    /**
     * 操作发生时的用户名快照，避免用户被删除后历史不可读。
     */
    @Column(name = "username_snapshot", nullable = false, length = 100)
    private String usernameSnapshot = "";

    /**
     * 操作发生时的昵称快照。
     */
    @Column(name = "nickname_snapshot", nullable = false, length = 100)
    private String nicknameSnapshot = "";

    /**
     * 模块编码。
     */
    @Column(name = "module_code", nullable = false, length = 80)
    private String moduleCode;

    /**
     * 模块名称。
     */
    @Column(name = "module_name", nullable = false, length = 100)
    private String moduleName;

    /**
     * 动作编码。
     */
    @Column(name = "action_code", nullable = false, length = 120)
    private String actionCode;

    /**
     * 动作名称。
     */
    @Column(name = "action_name", nullable = false, length = 200)
    private String actionName;

    /**
     * 业务对象类型。
     */
    @Column(name = "biz_type", length = 80)
    private String bizType;

    /**
     * 业务对象 ID。
     */
    @Column(name = "biz_id")
    private Long bizId;

    /**
     * 请求方法。
     */
    @Column(name = "http_method", nullable = false, length = 10)
    private String httpMethod;

    /**
     * 实际请求路径。
     */
    @Column(name = "request_uri", nullable = false, length = 255)
    private String requestUri;

    /**
     * 匹配到的路由模板。
     */
    @Column(name = "route_pattern", nullable = false, length = 255)
    private String routePattern;

    /**
     * 当前接口需要的权限码。
     */
    @Column(name = "permission_code", length = 100)
    private String permissionCode;

    /**
     * 操作结果状态，例如 SUCCESS 或 FAILED。
     */
    @Column(name = "operation_status", nullable = false, length = 20)
    private String operationStatus;

    /**
     * HTTP 响应状态码。
     */
    @Column(name = "response_status", nullable = false)
    private Integer responseStatus;

    /**
     * 请求总耗时，单位毫秒。
     */
    @Column(name = "duration_ms", nullable = false)
    private Long durationMs;

    /**
     * 请求来源 IP。
     */
    @Column(name = "ip_address", length = 64)
    private String ipAddress;

    /**
     * 浏览器或客户端标识。
     */
    @Column(name = "user_agent", length = 1000)
    private String userAgent;

    /**
     * 已脱敏后的请求快照 JSON 文本。
     */
    @Column(name = "request_snapshot", columnDefinition = "TEXT")
    private String requestSnapshot;

    /**
     * 操作结果消息。
     */
    @Column(name = "result_message", length = 1000)
    private String resultMessage;

    /**
     * 日志创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * 首次入库时自动补齐创建时间。
     */
    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public UserEntity getUser() {
        return user;
    }

    public void setUser(UserEntity user) {
        this.user = user;
    }

    public String getUsernameSnapshot() {
        return usernameSnapshot;
    }

    public void setUsernameSnapshot(String usernameSnapshot) {
        this.usernameSnapshot = usernameSnapshot;
    }

    public String getNicknameSnapshot() {
        return nicknameSnapshot;
    }

    public void setNicknameSnapshot(String nicknameSnapshot) {
        this.nicknameSnapshot = nicknameSnapshot;
    }

    public String getModuleCode() {
        return moduleCode;
    }

    public void setModuleCode(String moduleCode) {
        this.moduleCode = moduleCode;
    }

    public String getModuleName() {
        return moduleName;
    }

    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }

    public String getActionCode() {
        return actionCode;
    }

    public void setActionCode(String actionCode) {
        this.actionCode = actionCode;
    }

    public String getActionName() {
        return actionName;
    }

    public void setActionName(String actionName) {
        this.actionName = actionName;
    }

    public String getBizType() {
        return bizType;
    }

    public void setBizType(String bizType) {
        this.bizType = bizType;
    }

    public Long getBizId() {
        return bizId;
    }

    public void setBizId(Long bizId) {
        this.bizId = bizId;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public void setHttpMethod(String httpMethod) {
        this.httpMethod = httpMethod;
    }

    public String getRequestUri() {
        return requestUri;
    }

    public void setRequestUri(String requestUri) {
        this.requestUri = requestUri;
    }

    public String getRoutePattern() {
        return routePattern;
    }

    public void setRoutePattern(String routePattern) {
        this.routePattern = routePattern;
    }

    public String getPermissionCode() {
        return permissionCode;
    }

    public void setPermissionCode(String permissionCode) {
        this.permissionCode = permissionCode;
    }

    public String getOperationStatus() {
        return operationStatus;
    }

    public void setOperationStatus(String operationStatus) {
        this.operationStatus = operationStatus;
    }

    public Integer getResponseStatus() {
        return responseStatus;
    }

    public void setResponseStatus(Integer responseStatus) {
        this.responseStatus = responseStatus;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(Long durationMs) {
        this.durationMs = durationMs;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public String getRequestSnapshot() {
        return requestSnapshot;
    }

    public void setRequestSnapshot(String requestSnapshot) {
        this.requestSnapshot = requestSnapshot;
    }

    public String getResultMessage() {
        return resultMessage;
    }

    public void setResultMessage(String resultMessage) {
        this.resultMessage = resultMessage;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
