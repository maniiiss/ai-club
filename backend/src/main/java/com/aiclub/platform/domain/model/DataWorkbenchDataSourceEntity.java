package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/** 项目私有只读数据源；连接凭据始终以密文保存，绝不在 DTO 回传。 */
@Entity
@Table(name = "data_workbench_data_source", uniqueConstraints = @UniqueConstraint(name = "uk_dw_query_source_project_name", columnNames = {"project_id", "name"}))
public class DataWorkbenchDataSourceEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "project_id", nullable = false) private ProjectEntity project;
    @Column(nullable = false, length = 120) private String name;
    @Column(name = "jdbc_url_ciphertext", nullable = false, columnDefinition = "TEXT") private String jdbcUrlCiphertext = "";
    @Column(name = "username_ciphertext", nullable = false, columnDefinition = "TEXT") private String usernameCiphertext = "";
    @Column(name = "password_ciphertext", nullable = false, columnDefinition = "TEXT") private String passwordCiphertext = "";
    @Column(name = "allowed_schemas", nullable = false, length = 1000) private String allowedSchemas = "public";
    /** 数据源连接或 Schema 配置版本；版本变化会让已生成的查询快照失效。 */
    @Column(name = "config_version", nullable = false) private long configVersion = 1L;
    @Column(nullable = false) private boolean enabled = true;
    @Column(name = "schema_snapshot_json", nullable = false, columnDefinition = "TEXT") private String schemaSnapshotJson = "{}";
    @Column(name = "schema_scanned_at") private LocalDateTime schemaScannedAt;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    @PrePersist void create() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate void update() { updatedAt = LocalDateTime.now(); }
    public Long getId(){return id;} public ProjectEntity getProject(){return project;} public void setProject(ProjectEntity v){project=v;}
    public String getName(){return name;} public void setName(String v){name=v;} public String getJdbcUrlCiphertext(){return jdbcUrlCiphertext;} public void setJdbcUrlCiphertext(String v){jdbcUrlCiphertext=v;}
    public String getUsernameCiphertext(){return usernameCiphertext;} public void setUsernameCiphertext(String v){usernameCiphertext=v;} public String getPasswordCiphertext(){return passwordCiphertext;} public void setPasswordCiphertext(String v){passwordCiphertext=v;}
    public String getAllowedSchemas(){return allowedSchemas;} public void setAllowedSchemas(String v){allowedSchemas=v;} public long getConfigVersion(){return configVersion;} public void setConfigVersion(long v){configVersion=v;} public boolean isEnabled(){return enabled;} public void setEnabled(boolean v){enabled=v;}
    public String getSchemaSnapshotJson(){return schemaSnapshotJson;} public void setSchemaSnapshotJson(String v){schemaSnapshotJson=v;} public LocalDateTime getSchemaScannedAt(){return schemaScannedAt;} public void setSchemaScannedAt(LocalDateTime v){schemaScannedAt=v;}
}
