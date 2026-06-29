package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.ConstraintMode;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 智能体调用日志：记录每次 AI 调用的用户/类型/模型/token/状态/耗时，
 * 配合 AgentUsageStatsController 提供多维度调用量统计。
 */
@Entity
@Table(name = "agent_invocation_log")
public class AgentInvocationLogEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 发起调用的用户 ID（系统内部调用可空）。
     */
    @Column(name = "user_id")
    private Long userId;

    /**
     * 用户名快照，用户删除后仍可回显。
     */
    @Column(name = "username_snapshot", nullable = false, length = 100)
    private String usernameSnapshot = "";

    /**
     * 昵称快照。
     */
    @Column(name = "nickname_snapshot", nullable = false, length = 100)
    private String nicknameSnapshot = "";

    /**
     * 智能体类型编码，对应 AgentType 枚举值。
     */
    @Column(name = "agent_type", nullable = false, length = 64)
    private String agentType;

    /**
     * 智能体业务编码（内置 agent 的 code 或自定义 agent 的关联 code）。
     */
    @Column(name = "agent_code", length = 80)
    private String agentCode;

    /**
     * 关联的智能体 ID（仅 USER_DEFINED_AGENT 或内置 agent 时填）。
     */
    @Column(name = "agent_id")
    private Long agentId;

    /**
     * 子动作，如 STANDARDIZE / BREAKDOWN / INGEST / QUERY 等。
     */
    @Column(length = 80)
    private String action;

    /**
     * 模型提供商：OPENAI / ANTHROPIC 等。
     */
    @Column(length = 20)
    private String provider;

    /**
     * 调用时使用的模型配置 ID。
     */
    @Column(name = "model_config_id")
    private Long modelConfigId;

    /**
     * 模型名快照，避免模型重命名后历史不可读。
     */
    @Column(name = "model_name", length = 120)
    private String modelName;

    /**
     * 调用状态：SUCCESS / FAILURE / TIMEOUT / CLIENT_DISCONNECTED / RATE_LIMITED / CREDIT_DENIED。
     */
    @Column(nullable = false, length = 20)
    private String status;

    /**
     * 错误类型简写：IO / TIMEOUT / PARSE / DOWNSTREAM_4XX / DOWNSTREAM_5XX / UNKNOWN 等。
     */
    @Column(name = "error_code", length = 80)
    private String errorCode;

    /**
     * 错误消息摘要（截断至 1000 字符）。
     */
    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    /**
     * 触发来源：USER_DIRECT / AUTO / SCHEDULED / WEBHOOK / SYSTEM。
     */
    @Column(name = "trigger_source", nullable = false, length = 20)
    private String triggerSource = "USER_DIRECT";

    /**
     * 请求 URI（HTTP 入口时填写）。
     */
    @Column(name = "request_uri", length = 255)
    private String requestUri;

    /**
     * 路由名称（前端页面来源，用于 Hermes 等场景）。
     */
    @Column(name = "route_name", length = 80)
    private String routeName;

    /**
     * 关联的项目 ID（不建外键以避免跨域约束）。
     */
    @Column(name = "project_id")
    private Long projectId;

    /**
     * 关联的任务 ID。
     */
    @Column(name = "task_id")
    private Long taskId;

    /**
     * 通用业务对象 ID（MR iid / scan run id / benchmark run id 等）。
     */
    @Column(name = "biz_id")
    private Long bizId;

    /**
     * 模型返回的 prompt token 数。
     */
    @Column(name = "prompt_tokens")
    private Integer promptTokens;

    /**
     * 模型返回的 completion token 数。
     */
    @Column(name = "completion_tokens")
    private Integer completionTokens;

    /**
     * 模型返回的总 token 数。
     */
    @Column(name = "total_tokens")
    private Integer totalTokens;

    /**
     * 输入字符数（不依赖 usage 的降级指标）。
     */
    @Column(name = "input_chars")
    private Integer inputChars;

    /**
     * 输出字符数。
     */
    @Column(name = "output_chars")
    private Integer outputChars;

    /**
     * 调用耗时（毫秒）。
     */
    @Column(name = "duration_ms", nullable = false)
    private Long durationMs;

    /**
     * 消费的积分数。
     */
    @Column(name = "cost_credits")
    private Integer costCredits;

    /**
     * 关联 ID（如 Hermes responseId / MR fingerprint 等）。
     */
    @Column(name = "correlation_id", length = 120)
    private String correlationId;

    /**
     * 记录创建时间。
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public AgentInvocationLogEntity() {
    }

    @PrePersist
    public void prePersist() {
        this.createdAt = LocalDateTime.now();
    }

    // ---------- Getters & Setters ----------

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getUsernameSnapshot() { return usernameSnapshot; }
    public void setUsernameSnapshot(String usernameSnapshot) { this.usernameSnapshot = usernameSnapshot; }

    public String getNicknameSnapshot() { return nicknameSnapshot; }
    public void setNicknameSnapshot(String nicknameSnapshot) { this.nicknameSnapshot = nicknameSnapshot; }

    public String getAgentType() { return agentType; }
    public void setAgentType(String agentType) { this.agentType = agentType; }

    public String getAgentCode() { return agentCode; }
    public void setAgentCode(String agentCode) { this.agentCode = agentCode; }

    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public Long getModelConfigId() { return modelConfigId; }
    public void setModelConfigId(Long modelConfigId) { this.modelConfigId = modelConfigId; }

    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorCode() { return errorCode; }
    public void setErrorCode(String errorCode) { this.errorCode = errorCode; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public String getTriggerSource() { return triggerSource; }
    public void setTriggerSource(String triggerSource) { this.triggerSource = triggerSource; }

    public String getRequestUri() { return requestUri; }
    public void setRequestUri(String requestUri) { this.requestUri = requestUri; }

    public String getRouteName() { return routeName; }
    public void setRouteName(String routeName) { this.routeName = routeName; }

    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }

    public Long getTaskId() { return taskId; }
    public void setTaskId(Long taskId) { this.taskId = taskId; }

    public Long getBizId() { return bizId; }
    public void setBizId(Long bizId) { this.bizId = bizId; }

    public Integer getPromptTokens() { return promptTokens; }
    public void setPromptTokens(Integer promptTokens) { this.promptTokens = promptTokens; }

    public Integer getCompletionTokens() { return completionTokens; }
    public void setCompletionTokens(Integer completionTokens) { this.completionTokens = completionTokens; }

    public Integer getTotalTokens() { return totalTokens; }
    public void setTotalTokens(Integer totalTokens) { this.totalTokens = totalTokens; }

    public Integer getInputChars() { return inputChars; }
    public void setInputChars(Integer inputChars) { this.inputChars = inputChars; }

    public Integer getOutputChars() { return outputChars; }
    public void setOutputChars(Integer outputChars) { this.outputChars = outputChars; }

    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }

    public Integer getCostCredits() { return costCredits; }
    public void setCostCredits(Integer costCredits) { this.costCredits = costCredits; }

    public String getCorrelationId() { return correlationId; }
    public void setCorrelationId(String correlationId) { this.correlationId = correlationId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}