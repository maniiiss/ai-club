package com.aiclub.platform.agentusage;

/**
 * 智能体调用状态枚举。与数据库 CHECK 约束对齐。
 */
public enum InvocationStatus {

    /** 调用成功。 */
    SUCCESS,
    /** 调用失败（业务异常或下游错误）。 */
    FAILURE,
    /** 调用超时。 */
    TIMEOUT,
    /** 客户端断开（流式 SSE 场景）。 */
    CLIENT_DISCONNECTED,
    /** 限流。 */
    RATE_LIMITED,
    /** 积分不足被拒。 */
    CREDIT_DENIED
}