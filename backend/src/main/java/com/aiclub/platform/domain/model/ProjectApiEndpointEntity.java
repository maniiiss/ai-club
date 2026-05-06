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

import java.time.LocalDateTime;

/**
 * 项目级 API 接口定义，统一保存文档、调试草稿和 OpenAPI 映射需要的最小结构。
 */
@Entity
@Table(name = "project_api_endpoint")
public class ProjectApiEndpointEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 归属项目。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private ProjectEntity project;

    /** 所属目录，为空表示挂在根层级。 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private ProjectApiFolderEntity folder;

    /** 接口名称，便于目录树快速识别业务意图。 */
    @Column(nullable = false, length = 160)
    private String name = "";

    /** HTTP 方法。 */
    @Column(nullable = false, length = 12)
    private String method = "GET";

    /** HTTP 路径。 */
    @Column(nullable = false, length = 500)
    private String path = "";

    /** 接口摘要。 */
    @Column(nullable = false, length = 200)
    private String summary = "";

    /** Markdown 说明。 */
    @Column(name = "description_markdown", nullable = false, columnDefinition = "TEXT")
    private String descriptionMarkdown = "";

    /** 请求体内容类型。 */
    @Column(name = "request_content_type", nullable = false, length = 120)
    private String requestContentType = "none";

    /** 路径参数表 JSON。 */
    @Column(name = "path_params_json", nullable = false, columnDefinition = "TEXT")
    private String pathParamsJson = "[]";

    /** Query 参数表 JSON。 */
    @Column(name = "query_params_json", nullable = false, columnDefinition = "TEXT")
    private String queryParamsJson = "[]";

    /** Header 参数表 JSON。 */
    @Column(name = "header_params_json", nullable = false, columnDefinition = "TEXT")
    private String headerParamsJson = "[]";

    /** 请求体示例文本。 */
    @Column(name = "body_example_text", nullable = false, columnDefinition = "TEXT")
    private String bodyExampleText = "";

    /** 响应示例 JSON。 */
    @Column(name = "response_examples_json", nullable = false, columnDefinition = "TEXT")
    private String responseExamplesJson = "[]";

    /** 调试配置 JSON。 */
    @Column(name = "debug_config_json", nullable = false, columnDefinition = "TEXT")
    private String debugConfigJson = "{}";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ProjectEntity getProject() {
        return project;
    }

    public void setProject(ProjectEntity project) {
        this.project = project;
    }

    public ProjectApiFolderEntity getFolder() {
        return folder;
    }

    public void setFolder(ProjectApiFolderEntity folder) {
        this.folder = folder;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getDescriptionMarkdown() {
        return descriptionMarkdown;
    }

    public void setDescriptionMarkdown(String descriptionMarkdown) {
        this.descriptionMarkdown = descriptionMarkdown;
    }

    public String getRequestContentType() {
        return requestContentType;
    }

    public void setRequestContentType(String requestContentType) {
        this.requestContentType = requestContentType;
    }

    public String getPathParamsJson() {
        return pathParamsJson;
    }

    public void setPathParamsJson(String pathParamsJson) {
        this.pathParamsJson = pathParamsJson;
    }

    public String getQueryParamsJson() {
        return queryParamsJson;
    }

    public void setQueryParamsJson(String queryParamsJson) {
        this.queryParamsJson = queryParamsJson;
    }

    public String getHeaderParamsJson() {
        return headerParamsJson;
    }

    public void setHeaderParamsJson(String headerParamsJson) {
        this.headerParamsJson = headerParamsJson;
    }

    public String getBodyExampleText() {
        return bodyExampleText;
    }

    public void setBodyExampleText(String bodyExampleText) {
        this.bodyExampleText = bodyExampleText;
    }

    public String getResponseExamplesJson() {
        return responseExamplesJson;
    }

    public void setResponseExamplesJson(String responseExamplesJson) {
        this.responseExamplesJson = responseExamplesJson;
    }

    public String getDebugConfigJson() {
        return debugConfigJson;
    }

    public void setDebugConfigJson(String debugConfigJson) {
        this.debugConfigJson = debugConfigJson;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
