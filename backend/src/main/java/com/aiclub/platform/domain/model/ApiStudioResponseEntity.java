package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 原生 API 工作台 - 响应定义。
 * 每个 API 可定义多个状态码的响应，每个响应有独立的 content_type、描述和示例。
 */
@Entity
@Table(name = "api_studio_response")
public class ApiStudioResponseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "endpoint_id", nullable = false)
    private Long endpointId;

    @Column(name = "status_code", nullable = false)
    private Integer statusCode = 200;

    @Column(name = "content_type", length = 128)
    private String contentType = "application/json";

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "example_body", columnDefinition = "TEXT")
    private String exampleBody;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEndpointId() { return endpointId; }
    public void setEndpointId(Long endpointId) { this.endpointId = endpointId; }

    public Integer getStatusCode() { return statusCode; }
    public void setStatusCode(Integer statusCode) { this.statusCode = statusCode; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getExampleBody() { return exampleBody; }
    public void setExampleBody(String exampleBody) { this.exampleBody = exampleBody; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
