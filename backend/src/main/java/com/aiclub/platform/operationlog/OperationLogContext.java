package com.aiclub.platform.operationlog;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 当前请求在通用操作日志链路中的上下文快照。
 */
public class OperationLogContext {

    /**
     * 请求进入控制器前的纳秒时间戳，用于计算耗时。
     */
    private final long startNanoTime;

    /**
     * 请求方法。
     */
    private final String httpMethod;

    /**
     * 实际请求路径。
     */
    private final String requestUri;

    /**
     * 匹配到的路由模板。
     */
    private final String routePattern;

    /**
     * 模块编码。
     */
    private final String moduleCode;

    /**
     * 模块名称。
     */
    private final String moduleName;

    /**
     * 动作编码。
     */
    private final String actionCode;

    /**
     * 动作名称。
     */
    private final String actionName;

    /**
     * 业务类型。
     */
    private final String bizType;

    /**
     * 业务主键。
     */
    private final Long bizId;

    /**
     * 权限码。
     */
    private final String permissionCode;

    /**
     * 请求体反序列化后的对象快照。
     */
    private JsonNode requestBody;

    /**
     * 控制器返回的成功标记。
     */
    private Boolean responseSuccess;

    /**
     * 控制器返回的结果消息。
     */
    private String resultMessage;

    /**
     * 从响应中反推的操作者用户ID。
     */
    private Long actorUserId;

    /**
     * 从响应中反推的操作者用户名快照。
     */
    private String actorUsername;

    /**
     * 从响应中反推的操作者昵称快照。
     */
    private String actorNickname;

    public OperationLogContext(long startNanoTime,
                               String httpMethod,
                               String requestUri,
                               String routePattern,
                               String moduleCode,
                               String moduleName,
                               String actionCode,
                               String actionName,
                               String bizType,
                               Long bizId,
                               String permissionCode) {
        this.startNanoTime = startNanoTime;
        this.httpMethod = httpMethod;
        this.requestUri = requestUri;
        this.routePattern = routePattern;
        this.moduleCode = moduleCode;
        this.moduleName = moduleName;
        this.actionCode = actionCode;
        this.actionName = actionName;
        this.bizType = bizType;
        this.bizId = bizId;
        this.permissionCode = permissionCode;
    }

    public long getStartNanoTime() {
        return startNanoTime;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public String getRequestUri() {
        return requestUri;
    }

    public String getRoutePattern() {
        return routePattern;
    }

    public String getModuleCode() {
        return moduleCode;
    }

    public String getModuleName() {
        return moduleName;
    }

    public String getActionCode() {
        return actionCode;
    }

    public String getActionName() {
        return actionName;
    }

    public String getBizType() {
        return bizType;
    }

    public Long getBizId() {
        return bizId;
    }

    public String getPermissionCode() {
        return permissionCode;
    }

    public JsonNode getRequestBody() {
        return requestBody;
    }

    public void setRequestBody(JsonNode requestBody) {
        this.requestBody = requestBody;
    }

    public Boolean getResponseSuccess() {
        return responseSuccess;
    }

    public void setResponseSuccess(Boolean responseSuccess) {
        this.responseSuccess = responseSuccess;
    }

    public String getResultMessage() {
        return resultMessage;
    }

    public void setResultMessage(String resultMessage) {
        this.resultMessage = resultMessage;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public void setActorUserId(Long actorUserId) {
        this.actorUserId = actorUserId;
    }

    public String getActorUsername() {
        return actorUsername;
    }

    public void setActorUsername(String actorUsername) {
        this.actorUsername = actorUsername;
    }

    public String getActorNickname() {
        return actorNickname;
    }

    public void setActorNickname(String actorNickname) {
        this.actorNickname = actorNickname;
    }
}
