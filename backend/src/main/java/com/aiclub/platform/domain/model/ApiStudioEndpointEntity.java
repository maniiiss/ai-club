package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.LocalDateTime;

/**
 * 原生 API 工作台 - API 主体定义。
 * 保存接口名称、HTTP 方法、路径、状态、请求 Body 类型、参数 Schema 等核心信息。
 * revision 用于乐观锁，并发保存时校验版本号避免覆盖。
 */
@Entity
@Table(name = "api_studio_endpoint")
public class ApiStudioEndpointEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "directory_id")
    private Long directoryId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(nullable = false, length = 10)
    private String method = "GET";

    @Column(nullable = false, length = 512)
    private String path = "/";

    @Column(length = 512)
    private String summary;

    @Column(name = "description_markdown", columnDefinition = "TEXT")
    private String descriptionMarkdown;

    @Column(nullable = false, length = 20)
    private String status = "DRAFT";

    @Column(name = "request_body_type", nullable = false, length = 30)
    private String requestBodyType = "NONE";

    @Column(name = "request_body_schema_json", columnDefinition = "TEXT")
    private String requestBodySchemaJson;

    @Column(name = "request_body_example", columnDefinition = "TEXT")
    private String requestBodyExample;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Version
    private Integer revision = 1;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }

    public Long getDirectoryId() { return directoryId; }
    public void setDirectoryId(Long directoryId) { this.directoryId = directoryId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }

    public String getDescriptionMarkdown() { return descriptionMarkdown; }
    public void setDescriptionMarkdown(String descriptionMarkdown) { this.descriptionMarkdown = descriptionMarkdown; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRequestBodyType() { return requestBodyType; }
    public void setRequestBodyType(String requestBodyType) { this.requestBodyType = requestBodyType; }

    public String getRequestBodySchemaJson() { return requestBodySchemaJson; }
    public void setRequestBodySchemaJson(String requestBodySchemaJson) { this.requestBodySchemaJson = requestBodySchemaJson; }

    public String getRequestBodyExample() { return requestBodyExample; }
    public void setRequestBodyExample(String requestBodyExample) { this.requestBodyExample = requestBodyExample; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    public Integer getRevision() { return revision; }
    public void setRevision(Integer revision) { this.revision = revision; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }

    public Long getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(Long updatedBy) { this.updatedBy = updatedBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
