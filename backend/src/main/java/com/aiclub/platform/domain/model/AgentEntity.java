package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "agent_info")
public class AgentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 50)
    private String type;

    @Column(name = "access_type", nullable = false, length = 20)
    private String accessType = "BUILT_IN";

    @Column(name = "builtin_code", length = 50)
    private String builtinCode;

    @Column(nullable = false, length = 30)
    private String status;

    @Column(nullable = false)
    private Boolean enabled = Boolean.TRUE;

    @Column(nullable = false, length = 500)
    private String capability = "";

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description = "";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ai_model_config_id")
    private AiModelConfigEntity aiModelConfig;

    @Column(name = "system_prompt", columnDefinition = "TEXT")
    private String systemPrompt;

    @Column(name = "user_prompt_template", columnDefinition = "TEXT")
    private String userPromptTemplate;

    @Column(name = "endpoint_url", length = 500)
    private String endpointUrl;

    @Column(name = "runtime_type", length = 30)
    private String runtimeType;

    /** 新版 Runtime Registry 编码；为空时继续按 runtimeType 做兼容解析。 */
    @Column(name = "runtime_registry_code", length = 40)
    private String runtimeRegistryCode;

    /** Agent Profile 版本，用于任务创建时生成可回放的配置快照。 */
    @Column(name = "profile_version", nullable = false)
    private Long profileVersion = 1L;

    /** 管理员配置的候选降级 Runtime 顺序，只有无副作用阶段才允许使用。 */
    @Column(name = "runtime_fallback_codes_json", nullable = false, columnDefinition = "TEXT")
    private String runtimeFallbackCodesJson = "[]";

    /** Profile 工具策略快照，写工具仍必须经过 backend 确认链路。 */
    @Column(name = "tool_policy_json", nullable = false, columnDefinition = "TEXT")
    private String toolPolicyJson = "{}";

    /** Profile 沙箱策略快照，运行时只能在平台允许的范围内执行。 */
    @Column(name = "sandbox_policy_json", nullable = false, columnDefinition = "TEXT")
    private String sandboxPolicyJson = "{}";

    /** Profile 预算上限，空值表示沿用平台默认预算。 */
    @Column(name = "budget_tokens")
    private Integer budgetTokens;

    /** 会话策略快照，例如是否允许恢复和最大上下文轮数。 */
    @Column(name = "session_policy_json", nullable = false, columnDefinition = "TEXT")
    private String sessionPolicyJson = "{}";

    @Column(name = "runtime_agent_ref", length = 100)
    private String runtimeAgentRef;

    @Column(name = "runtime_session_key_template", length = 500)
    private String runtimeSessionKeyTemplate;

    @Column(name = "http_method", length = 10)
    private String httpMethod;

    @Column(name = "http_headers", columnDefinition = "TEXT")
    private String httpHeaders;

    @Column(name = "http_auth_type", length = 20)
    private String httpAuthType;

    @Column(name = "http_auth_token_ciphertext", columnDefinition = "TEXT")
    private String httpAuthTokenCiphertext;

    @Column(name = "http_request_template", columnDefinition = "TEXT")
    private String httpRequestTemplate;

    @Column(name = "http_response_path", length = 255)
    private String httpResponsePath;

    @Column(name = "timeout_seconds")
    private Integer timeoutSeconds = 60;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private ProjectEntity project;

    public AgentEntity() {
    }

    public AgentEntity(String name, String type, String status, String capability, ProjectEntity project) {
        this.name = name;
        this.type = type;
        this.status = status;
        this.capability = capability;
        this.project = project;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getAccessType() {
        return accessType;
    }

    public void setAccessType(String accessType) {
        this.accessType = accessType;
    }

    public String getBuiltinCode() {
        return builtinCode;
    }

    public void setBuiltinCode(String builtinCode) {
        this.builtinCode = builtinCode;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Boolean getEnabled() {
        return enabled;
    }

    public void setEnabled(Boolean enabled) {
        this.enabled = enabled;
    }

    public String getCapability() {
        return capability;
    }

    public void setCapability(String capability) {
        this.capability = capability;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public AiModelConfigEntity getAiModelConfig() {
        return aiModelConfig;
    }

    public void setAiModelConfig(AiModelConfigEntity aiModelConfig) {
        this.aiModelConfig = aiModelConfig;
    }

    public String getSystemPrompt() {
        return systemPrompt;
    }

    public void setSystemPrompt(String systemPrompt) {
        this.systemPrompt = systemPrompt;
    }

    public String getUserPromptTemplate() {
        return userPromptTemplate;
    }

    public void setUserPromptTemplate(String userPromptTemplate) {
        this.userPromptTemplate = userPromptTemplate;
    }

    public String getEndpointUrl() {
        return endpointUrl;
    }

    public void setEndpointUrl(String endpointUrl) {
        this.endpointUrl = endpointUrl;
    }

    public String getRuntimeType() {
        return runtimeType;
    }

    public void setRuntimeType(String runtimeType) {
        this.runtimeType = runtimeType;
    }

    public String getRuntimeRegistryCode() { return runtimeRegistryCode; }
    public void setRuntimeRegistryCode(String runtimeRegistryCode) { this.runtimeRegistryCode = runtimeRegistryCode; }
    public Long getProfileVersion() { return profileVersion; }
    public void setProfileVersion(Long profileVersion) { this.profileVersion = profileVersion; }
    public String getRuntimeFallbackCodesJson() { return runtimeFallbackCodesJson; }
    public void setRuntimeFallbackCodesJson(String runtimeFallbackCodesJson) { this.runtimeFallbackCodesJson = runtimeFallbackCodesJson; }
    public String getToolPolicyJson() { return toolPolicyJson; }
    public void setToolPolicyJson(String toolPolicyJson) { this.toolPolicyJson = toolPolicyJson; }
    public String getSandboxPolicyJson() { return sandboxPolicyJson; }
    public void setSandboxPolicyJson(String sandboxPolicyJson) { this.sandboxPolicyJson = sandboxPolicyJson; }
    public Integer getBudgetTokens() { return budgetTokens; }
    public void setBudgetTokens(Integer budgetTokens) { this.budgetTokens = budgetTokens; }
    public String getSessionPolicyJson() { return sessionPolicyJson; }
    public void setSessionPolicyJson(String sessionPolicyJson) { this.sessionPolicyJson = sessionPolicyJson; }

    public String getRuntimeAgentRef() {
        return runtimeAgentRef;
    }

    public void setRuntimeAgentRef(String runtimeAgentRef) {
        this.runtimeAgentRef = runtimeAgentRef;
    }

    public String getRuntimeSessionKeyTemplate() {
        return runtimeSessionKeyTemplate;
    }

    public void setRuntimeSessionKeyTemplate(String runtimeSessionKeyTemplate) {
        this.runtimeSessionKeyTemplate = runtimeSessionKeyTemplate;
    }

    public String getHttpMethod() {
        return httpMethod;
    }

    public void setHttpMethod(String httpMethod) {
        this.httpMethod = httpMethod;
    }

    public String getHttpHeaders() {
        return httpHeaders;
    }

    public void setHttpHeaders(String httpHeaders) {
        this.httpHeaders = httpHeaders;
    }

    public String getHttpAuthType() {
        return httpAuthType;
    }

    public void setHttpAuthType(String httpAuthType) {
        this.httpAuthType = httpAuthType;
    }

    public String getHttpAuthTokenCiphertext() {
        return httpAuthTokenCiphertext;
    }

    public void setHttpAuthTokenCiphertext(String httpAuthTokenCiphertext) {
        this.httpAuthTokenCiphertext = httpAuthTokenCiphertext;
    }

    public String getHttpRequestTemplate() {
        return httpRequestTemplate;
    }

    public void setHttpRequestTemplate(String httpRequestTemplate) {
        this.httpRequestTemplate = httpRequestTemplate;
    }

    public String getHttpResponsePath() {
        return httpResponsePath;
    }

    public void setHttpResponsePath(String httpResponsePath) {
        this.httpResponsePath = httpResponsePath;
    }

    public Integer getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public void setTimeoutSeconds(Integer timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }
}
