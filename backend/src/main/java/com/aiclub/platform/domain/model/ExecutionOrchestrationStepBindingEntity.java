package com.aiclub.platform.domain.model;

import jakarta.persistence.*;

/** 编排版本中的逻辑步骤配置；名称和 Runtime 字段用于保留发布时快照。 */
@Entity
@Table(name = "execution_orchestration_step_binding")
public class ExecutionOrchestrationStepBindingEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "version_id", nullable = false) private ExecutionOrchestrationVersionEntity version;
    @Column(name = "step_code", nullable = false, length = 50) private String stepCode;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "agent_id") private AgentEntity agent;
    @Column(name = "timeout_seconds", nullable = false) private Integer timeoutSeconds = 600;
    @Column(name = "agent_name_snapshot", nullable = false, length = 100) private String agentNameSnapshot = "";
    @Column(name = "access_type_snapshot", nullable = false, length = 20) private String accessTypeSnapshot = "";
    @Column(name = "runtime_type_snapshot", length = 30) private String runtimeTypeSnapshot;
    public Long getId(){return id;} public void setId(Long id){this.id=id;}
    public ExecutionOrchestrationVersionEntity getVersion(){return version;} public void setVersion(ExecutionOrchestrationVersionEntity v){version=v;}
    public String getStepCode(){return stepCode;} public void setStepCode(String v){stepCode=v;}
    public AgentEntity getAgent(){return agent;} public void setAgent(AgentEntity v){agent=v;}
    public Integer getTimeoutSeconds(){return timeoutSeconds;} public void setTimeoutSeconds(Integer v){timeoutSeconds=v;}
    public String getAgentNameSnapshot(){return agentNameSnapshot;} public void setAgentNameSnapshot(String v){agentNameSnapshot=v;}
    public String getAccessTypeSnapshot(){return accessTypeSnapshot;} public void setAccessTypeSnapshot(String v){accessTypeSnapshot=v;}
    public String getRuntimeTypeSnapshot(){return runtimeTypeSnapshot;} public void setRuntimeTypeSnapshot(String v){runtimeTypeSnapshot=v;}
}
