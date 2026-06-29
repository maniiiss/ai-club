package com.aiclub.platform.domain.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 原生 API 工作台 - API 参数定义。
 * 保存 Path、Query、Header、FORM_DATA、FORM_URLENCODED 等各类参数。
 * FORM_DATA 中 data_type=FILE 表示文件上传字段，文件内容不持久化。
 */
@Entity
@Table(name = "api_studio_endpoint_parameter")
public class ApiStudioEndpointParameterEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "endpoint_id", nullable = false)
    private Long endpointId;

    @Column(nullable = false, length = 20)
    private String location;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "data_type", nullable = false, length = 20)
    private String dataType = "STRING";

    @Column(nullable = false)
    private Boolean required = false;

    @Column(name = "default_value", columnDefinition = "TEXT")
    private String defaultValue;

    @Column(name = "example_value", columnDefinition = "TEXT")
    private String exampleValue;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "enum_json", columnDefinition = "TEXT")
    private String enumJson;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    // ========== getters & setters ==========

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getEndpointId() { return endpointId; }
    public void setEndpointId(Long endpointId) { this.endpointId = endpointId; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDataType() { return dataType; }
    public void setDataType(String dataType) { this.dataType = dataType; }

    public Boolean getRequired() { return required; }
    public void setRequired(Boolean required) { this.required = required; }

    public String getDefaultValue() { return defaultValue; }
    public void setDefaultValue(String defaultValue) { this.defaultValue = defaultValue; }

    public String getExampleValue() { return exampleValue; }
    public void setExampleValue(String exampleValue) { this.exampleValue = exampleValue; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getEnumJson() { return enumJson; }
    public void setEnumJson(String enumJson) { this.enumJson = enumJson; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
