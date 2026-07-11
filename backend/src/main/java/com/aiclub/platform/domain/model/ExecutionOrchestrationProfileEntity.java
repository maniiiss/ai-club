package com.aiclub.platform.domain.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** 执行编排配置入口，记录平台或项目在场景下当前生效与编辑中的版本。 */
@Entity
@Table(name = "execution_orchestration_profile")
public class ExecutionOrchestrationProfileEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "scope_type", nullable = false, length = 20) private String scopeType;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id") private ProjectEntity project;
    @Column(name = "scenario_code", nullable = false, length = 50) private String scenarioCode;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "draft_version_id") private ExecutionOrchestrationVersionEntity draftVersion;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "published_version_id") private ExecutionOrchestrationVersionEntity publishedVersion;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    @PrePersist void onCreate(){ createdAt=updatedAt=LocalDateTime.now(); }
    @PreUpdate void onUpdate(){ updatedAt=LocalDateTime.now(); }
    public Long getId(){return id;} public void setId(Long id){this.id=id;}
    public String getScopeType(){return scopeType;} public void setScopeType(String v){scopeType=v;}
    public ProjectEntity getProject(){return project;} public void setProject(ProjectEntity v){project=v;}
    public String getScenarioCode(){return scenarioCode;} public void setScenarioCode(String v){scenarioCode=v;}
    public ExecutionOrchestrationVersionEntity getDraftVersion(){return draftVersion;} public void setDraftVersion(ExecutionOrchestrationVersionEntity v){draftVersion=v;}
    public ExecutionOrchestrationVersionEntity getPublishedVersion(){return publishedVersion;} public void setPublishedVersion(ExecutionOrchestrationVersionEntity v){publishedVersion=v;}
    public LocalDateTime getCreatedAt(){return createdAt;} public LocalDateTime getUpdatedAt(){return updatedAt;}
}
