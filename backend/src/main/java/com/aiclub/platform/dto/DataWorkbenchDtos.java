package com.aiclub.platform.dto;

import com.aiclub.platform.common.DataPermissionScopeType;

import java.util.List;
import java.util.Map;

/**
 * DataWorkbench 对外 DTO 集合。
 * 业务意图：集中定义轻量工作台、实体配置、DataChange 预览和审计返回结构，避免前后端协议分散。
 */
public final class DataWorkbenchDtos {

    private DataWorkbenchDtos() {
    }

    public record DataWorkbenchAppItem(
            String code,
            String name,
            String description,
            boolean enabled
    ) {
    }

    public record DataWorkbenchFieldItem(
            Long id,
            String fieldCode,
            String fieldName,
            String columnName,
            String dataType,
            String synonyms,
            boolean updatable,
            boolean locator,
            boolean sensitive,
            boolean enabled,
            Integer sortOrder
    ) {
    }

    public record DataWorkbenchEntityItem(
            Long id,
            String entityCode,
            String entityName,
            String description,
            String tableName,
            String primaryKeyColumn,
            String projectIdColumn,
            Integer maxAffectedRows,
            DataPermissionScopeType requestScope,
            DataPermissionScopeType executeScope,
            DataPermissionScopeType rollbackScope,
            boolean enabled,
            List<DataWorkbenchFieldItem> fields
    ) {
    }

    public record DataChangeDsl(
            String version,
            String operation,
            String entityCode,
            Map<String, Object> set,
            Map<String, Object> where
    ) {
    }

    public record DataChangePreviewResult(
            DataChangeDsl dsl,
            DataWorkbenchEntityItem entity,
            String sqlSummary,
            int affectedRows,
            String riskLevel,
            List<String> riskReasons,
            boolean approvalRequired
    ) {
    }

    public record DataChangeRequestItem(
            Long id,
            Long projectId,
            String projectName,
            Long entityId,
            String entityCode,
            String entityName,
            String originalText,
            DataChangeDsl dsl,
            String previewSqlSummary,
            String riskLevel,
            String approvalStatus,
            String executionStatus,
            String rollbackStatus,
            Integer affectedRows,
            List<String> riskReasons,
            String rejectReason,
            String rollbackConflictReason,
            String requesterName,
            String approverName,
            String executorName,
            String rollbackUserName,
            String createdAt,
            String approvedAt,
            String executedAt,
            String rolledBackAt
    ) {
    }

    public record DataChangeAuditItem(
            Long id,
            Long requestId,
            String entityName,
            String primaryKeyValue,
            Map<String, Object> beforeSnapshot,
            Map<String, Object> afterSnapshot,
            String sqlSummary,
            String rollbackStatus,
            String rollbackConflictReason,
            String createdAt,
            String rolledBackAt
    ) {
    }
}
