package com.aiclub.platform.agentusage;

/**
 * 智能体调用触发来源。
 */
public enum TriggerSource {

    /** 用户直接触发。 */
    USER_DIRECT,
    /** 系统自动触发（如自动合并审查调度）。 */
    AUTO,
    /** 定时调度触发。 */
    SCHEDULED,
    /** 外部 Webhook 触发。 */
    WEBHOOK,
    /** 平台内部系统调用。 */
    SYSTEM
}