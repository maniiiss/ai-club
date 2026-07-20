package com.aiclub.platform.domain.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/** 版本化业务语义模型；发布后运行时仅消费 publishedDefinitionJson。 */
@Entity
@Table(name = "data_workbench_semantic_model", uniqueConstraints = @UniqueConstraint(name = "uk_dw_semantic_project_name", columnNames = {"project_id", "name"}))
public class DataWorkbenchSemanticModelEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "data_source_id", nullable = false) private DataWorkbenchDataSourceEntity dataSource;
    @Column(nullable = false, length = 120) private String name;
    @Column(name="draft_definition_json", nullable=false, columnDefinition="TEXT") private String draftDefinitionJson="{}";
    @Column(name="published_definition_json", nullable=false, columnDefinition="TEXT") private String publishedDefinitionJson="{}";
    @Column(name="published_schema_snapshot_json", nullable=false, columnDefinition="TEXT") private String publishedSchemaSnapshotJson="{}";
    @Column(name="model_config_id") private Long modelConfigId;
    @Column(name="model_name_snapshot", nullable=false, length=120) private String modelNameSnapshot="";
    @Column(name="model_provider_snapshot", nullable=false, length=30) private String modelProviderSnapshot="";
    @Column(name="model_identifier_snapshot", nullable=false, length=120) private String modelIdentifierSnapshot="";
    /** 发布时固定所依赖的数据源版本，避免连接凭据或 Schema 变化后继续使用旧语义。 */
    @Column(name="data_source_version", nullable=false) private long dataSourceVersion;
    @Column(name="version_no", nullable=false) private int versionNo;
    @Column(nullable=false, length=20) private String status="DRAFT";
    @Column(name="created_at", nullable=false) private LocalDateTime createdAt;
    @Column(name="updated_at", nullable=false) private LocalDateTime updatedAt;
    @PrePersist void create(){createdAt=updatedAt=LocalDateTime.now();} @PreUpdate void update(){updatedAt=LocalDateTime.now();}
    public Long getId(){return id;} public ProjectEntity getProject(){return project;} public void setProject(ProjectEntity v){project=v;} public DataWorkbenchDataSourceEntity getDataSource(){return dataSource;} public void setDataSource(DataWorkbenchDataSourceEntity v){dataSource=v;}
    public String getName(){return name;} public void setName(String v){name=v;} public String getDraftDefinitionJson(){return draftDefinitionJson;} public void setDraftDefinitionJson(String v){draftDefinitionJson=v;} public String getPublishedDefinitionJson(){return publishedDefinitionJson;} public void setPublishedDefinitionJson(String v){publishedDefinitionJson=v;}
    public String getPublishedSchemaSnapshotJson(){return publishedSchemaSnapshotJson;} public void setPublishedSchemaSnapshotJson(String v){publishedSchemaSnapshotJson=v;} public Long getModelConfigId(){return modelConfigId;} public void setModelConfigId(Long v){modelConfigId=v;} public void setModelNameSnapshot(String v){modelNameSnapshot=v;} public void setModelProviderSnapshot(String v){modelProviderSnapshot=v;} public void setModelIdentifierSnapshot(String v){modelIdentifierSnapshot=v;} public long getDataSourceVersion(){return dataSourceVersion;} public void setDataSourceVersion(long v){dataSourceVersion=v;}
    public int getVersionNo(){return versionNo;} public void setVersionNo(int v){versionNo=v;} public String getStatus(){return status;} public void setStatus(String v){status=v;}
}
