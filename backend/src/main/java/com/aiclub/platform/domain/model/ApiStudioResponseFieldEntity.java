package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 原生 API 工作台 - 响应字段树。
 * 支持 parent_id 递归结构，保存响应 JSON 的字段名、类型、必填、说明和示例。
 */
@Entity
@Table(name = "api_studio_response_field")
public class ApiStudioResponseFieldEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "response_id", nullable = false)
    private Long responseId;

    @Column(name = "parent_id")
    private Long parentId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "data_type", nullable = false, length = 20)
    private String dataType = "STRING";

    @Column(nullable = false)
    private Boolean required = false;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "example_value", columnDefinition = "TEXT")
    private String exampleValue;

    @Column(name = "enum_json", columnDefinition = "TEXT")
    private String enumJson;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getResponseId() { return responseId; }
    public void setResponseId(Long responseId) { this.responseId = responseId; }

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public Boolean getRequired() { return required; }
    public void setRequired(Boolean required) { this.required = required; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getExampleValue() { return exampleValue; }
    public void setExampleValue(String exampleValue) { this.exampleValue = exampleValue; }

    public String getEnumJson() { return enumJson; }
    public void setEnumJson(String enumJson) { this.enumJson = enumJson; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
