package com.aiclub.platform.dto.request;

import com.aiclub.platform.common.DataPermissionScopeType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * DataWorkbench 请求 DTO 集合。
 */
public final class DataWorkbenchRequests {

    private DataWorkbenchRequests() {
    }

    public record DataChangeTextRequest(
            @NotBlank(message = "变更内容不能为空")
            @Size(max = 4000, message = "变更内容长度不能超过4000")
            String text,
            String entityCode,
            Map<String, Object> dsl
    ) {
    }

    public record DataChangeSubmitRequest(
            @NotBlank(message = "变更内容不能为空")
            @Size(max = 4000, message = "变更内容长度不能超过4000")
            String text,
            String entityCode,
            Map<String, Object> dsl
    ) {
    }

    public record DataChangeRejectRequest(
            @Size(max = 1000, message = "驳回原因长度不能超过1000")
            String reason
    ) {
    }

    public record DataWorkbenchEntityRequest(
            @NotBlank(message = "实体编码不能为空")
            @Size(max = 80, message = "实体编码长度不能超过80")
            String entityCode,
            @NotBlank(message = "实体名称不能为空")
            @Size(max = 120, message = "实体名称长度不能超过120")
            String entityName,
            @Size(max = 1000, message = "描述长度不能超过1000")
            String description,
            @NotBlank(message = "表名不能为空")
            @Size(max = 120, message = "表名长度不能超过120")
            String tableName,
            @NotBlank(message = "主键列不能为空")
            @Size(max = 80, message = "主键列长度不能超过80")
            String primaryKeyColumn,
            @NotBlank(message = "项目列不能为空")
            @Size(max = 80, message = "项目列长度不能超过80")
            String projectIdColumn,
            @NotNull(message = "最大影响行数不能为空")
            @Min(value = 1, message = "最大影响行数必须大于0")
            Integer maxAffectedRows,
            @NotNull(message = "请求权限范围不能为空")
            DataPermissionScopeType requestScope,
            @NotNull(message = "执行权限范围不能为空")
            DataPermissionScopeType executeScope,
            @NotNull(message = "回滚权限范围不能为空")
            DataPermissionScopeType rollbackScope,
            @NotNull(message = "启用状态不能为空")
            Boolean enabled,
            @Valid
            List<DataWorkbenchFieldRequest> fields
    ) {
    }

    public record DataWorkbenchFieldRequest(
            Long id,
            @NotBlank(message = "字段编码不能为空")
            @Size(max = 80, message = "字段编码长度不能超过80")
            String fieldCode,
            @NotBlank(message = "字段名称不能为空")
            @Size(max = 120, message = "字段名称长度不能超过120")
            String fieldName,
            @NotBlank(message = "列名不能为空")
            @Size(max = 80, message = "列名长度不能超过80")
            String columnName,
            @NotBlank(message = "字段类型不能为空")
            @Size(max = 40, message = "字段类型长度不能超过40")
            String dataType,
            @Size(max = 1000, message = "同义词长度不能超过1000")
            String synonyms,
            Boolean updatable,
            Boolean locator,
            Boolean sensitive,
            Boolean enabled,
            Integer sortOrder
    ) {
    }
}
