package com.aiclub.platform.agentusage;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.security.AuthContext;

/**
 * 单次智能体调用的上下文快照。由调用方在埋点前构造，
 * 描述"本次调用是哪个智能体、动作、模型、关联业务对象、触发来源"。
 *
 * <p>用 builder 风格便于扩展，所有字段均可空（除 {@code agentType}）。
 */
public final class AgentInvocationContext {

    private final AgentType agentType;
    private final String action;
    private final TriggerSource triggerSource;
    private final String provider;
    private final Long modelConfigId;
    private final String modelName;
    private final Long projectId;
    private final Long taskId;
    private final Long bizId;
    private final Long agentId;
    private final String agentCode;
    private final String requestUri;
    private final String routeName;
    private final String correlationId;
    private final Integer inputChars;
    private final AuthContext authContextSnapshot;

    private AgentInvocationContext(Builder b) {
        this.agentType = b.agentType;
        this.action = b.action;
        this.triggerSource = b.triggerSource != null ? b.triggerSource : TriggerSource.USER_DIRECT;
        this.provider = b.provider;
        this.modelConfigId = b.modelConfigId;
        this.modelName = b.modelName;
        this.projectId = b.projectId;
        this.taskId = b.taskId;
        this.bizId = b.bizId;
        this.agentId = b.agentId;
        this.agentCode = b.agentCode;
        this.requestUri = b.requestUri;
        this.routeName = b.routeName;
        this.correlationId = b.correlationId;
        this.inputChars = b.inputChars;
        this.authContextSnapshot = b.authContextSnapshot;
    }

    public static Builder builder(AgentType agentType) {
        return new Builder(agentType);
    }

    /**
     * 兜底场景：在 ModelConfigService 检测到没有显式埋点上下文时构造。
     *
     * @param modelConfig 当前模型配置（可空）
     * @param callerClassName 调用 ModelConfigService 的栈顶 Service 类名
     */
    public static AgentInvocationContext unknownFallback(AiModelConfigEntity modelConfig, String callerClassName) {
        Builder b = builder(AgentType.UNKNOWN_MODEL_CALL).action(callerClassName);
        if (modelConfig != null) {
            b.modelConfigId(modelConfig.getId())
                    .modelName(modelConfig.getModelName())
                    .provider(modelConfig.getProvider());
        }
        return b.triggerSource(TriggerSource.SYSTEM).build();
    }

    public AgentType getAgentType() { return agentType; }
    public String getAction() { return action; }
    public TriggerSource getTriggerSource() { return triggerSource; }
    public String getProvider() { return provider; }
    public Long getModelConfigId() { return modelConfigId; }
    public String getModelName() { return modelName; }
    public Long getProjectId() { return projectId; }
    public Long getTaskId() { return taskId; }
    public Long getBizId() { return bizId; }
    public Long getAgentId() { return agentId; }
    public String getAgentCode() { return agentCode; }
    public String getRequestUri() { return requestUri; }
    public String getRouteName() { return routeName; }
    public String getCorrelationId() { return correlationId; }
    public Integer getInputChars() { return inputChars; }
    public AuthContext getAuthContextSnapshot() { return authContextSnapshot; }

    public static final class Builder {

        private final AgentType agentType;
        private String action;
        private TriggerSource triggerSource;
        private String provider;
        private Long modelConfigId;
        private String modelName;
        private Long projectId;
        private Long taskId;
        private Long bizId;
        private Long agentId;
        private String agentCode;
        private String requestUri;
        private String routeName;
        private String correlationId;
        private Integer inputChars;
        private AuthContext authContextSnapshot;

        private Builder(AgentType agentType) {
            if (agentType == null) {
                throw new IllegalArgumentException("agentType must not be null");
            }
            this.agentType = agentType;
        }

        public Builder action(String action) { this.action = action; return this; }
        public Builder triggerSource(TriggerSource triggerSource) { this.triggerSource = triggerSource; return this; }
        public Builder provider(String provider) { this.provider = provider; return this; }
        public Builder modelConfigId(Long modelConfigId) { this.modelConfigId = modelConfigId; return this; }
        public Builder modelName(String modelName) { this.modelName = modelName; return this; }

        /**
         * 一次性从 AiModelConfigEntity 抽取 provider / modelConfigId / modelName。
         */
        public Builder modelConfig(AiModelConfigEntity modelConfig) {
            if (modelConfig != null) {
                this.modelConfigId = modelConfig.getId();
                this.modelName = modelConfig.getModelName();
                this.provider = modelConfig.getProvider();
            }
            return this;
        }

        public Builder projectId(Long projectId) { this.projectId = projectId; return this; }
        public Builder taskId(Long taskId) { this.taskId = taskId; return this; }
        public Builder bizId(Long bizId) { this.bizId = bizId; return this; }
        public Builder agentId(Long agentId) { this.agentId = agentId; return this; }
        public Builder agentCode(String agentCode) { this.agentCode = agentCode; return this; }
        public Builder requestUri(String requestUri) { this.requestUri = requestUri; return this; }
        public Builder routeName(String routeName) { this.routeName = routeName; return this; }
        public Builder correlationId(String correlationId) { this.correlationId = correlationId; return this; }
        public Builder inputChars(Integer inputChars) { this.inputChars = inputChars; return this; }

        /**
         * 抓取当前 AuthContext 作为快照，用于异步 / 子线程场景。
         */
        public Builder captureAuthContext(AuthContext authContext) {
            this.authContextSnapshot = authContext;
            return this;
        }

        public AgentInvocationContext build() {
            return new AgentInvocationContext(this);
        }
    }
}