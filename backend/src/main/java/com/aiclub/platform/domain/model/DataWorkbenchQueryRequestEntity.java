package com.aiclub.platform.domain.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** 查询全过程审计；预览令牌绑定请求和发起人，防止跳过用户确认。 */
@Entity @Table(name="data_workbench_query_request")
public class DataWorkbenchQueryRequestEntity {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="project_id", nullable=false) private ProjectEntity project;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="semantic_model_id", nullable=false) private DataWorkbenchSemanticModelEntity semanticModel;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="requester_user_id") private UserEntity requesterUser;
 @Column(name="original_text",nullable=false,columnDefinition="TEXT") private String originalText="";
 @Column(name="interpretation_json",nullable=false,columnDefinition="TEXT") private String interpretationJson="{}";
 @Column(name="dsl_json",nullable=false,columnDefinition="TEXT") private String dslJson="{}";
 @Column(name="preview_token",nullable=false,length=100) private String previewToken="";
 @Column(name="sql_summary",nullable=false,columnDefinition="TEXT") private String sqlSummary="";
 @Column(name="result_summary",nullable=false,columnDefinition="TEXT") private String resultSummary="";
 @Column(nullable=false,length=20) private String status="INTERPRETED";
 @Column(name="error_message",nullable=false,length=1000) private String errorMessage="";
 @Column(name="executed_at") private LocalDateTime executedAt;
 @Column(name="created_at",nullable=false) private LocalDateTime createdAt; @Column(name="updated_at",nullable=false) private LocalDateTime updatedAt;
 @PrePersist void create(){createdAt=updatedAt=LocalDateTime.now();} @PreUpdate void update(){updatedAt=LocalDateTime.now();}
 public Long getId(){return id;} public void setProject(ProjectEntity v){project=v;} public ProjectEntity getProject(){return project;} public void setSemanticModel(DataWorkbenchSemanticModelEntity v){semanticModel=v;} public DataWorkbenchSemanticModelEntity getSemanticModel(){return semanticModel;} public void setRequesterUser(UserEntity v){requesterUser=v;} public UserEntity getRequesterUser(){return requesterUser;}
 public void setOriginalText(String v){originalText=v;} public String getOriginalText(){return originalText;} public void setInterpretationJson(String v){interpretationJson=v;} public String getInterpretationJson(){return interpretationJson;} public void setDslJson(String v){dslJson=v;} public String getDslJson(){return dslJson;} public void setPreviewToken(String v){previewToken=v;} public String getPreviewToken(){return previewToken;} public void setSqlSummary(String v){sqlSummary=v;} public String getSqlSummary(){return sqlSummary;} public void setResultSummary(String v){resultSummary=v;} public String getResultSummary(){return resultSummary;} public void setStatus(String v){status=v;} public String getStatus(){return status;} public void setErrorMessage(String v){errorMessage=v;} public void setExecutedAt(LocalDateTime v){executedAt=v;}
}
