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
            Long platformProjectId,
            String platformProjectName,
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

    /**
     * 数据实体解析草稿。
     * 业务意图：管理员粘贴 DDL 或 Java 实体类后，后端返回一份可直接回填表单的实体骨架 + 字段清单，
     * 前端按“合并”策略与当前 form 状态合并。platformProjectId 由管理员在下拉里显式选择，解析器不推断。
     */
    public record DataWorkbenchEntityDraft(
            String entityCode,
            String entityName,
            String description,
            String tableName,
            String primaryKeyColumn,
            Long platformProjectId,
            Integer maxAffectedRows,
            DataPermissionScopeType requestScope,
            DataPermissionScopeType executeScope,
            DataPermissionScopeType rollbackScope,
            Boolean enabled,
            List<DataWorkbenchFieldItem> fields
    ) {
    }

    /**
     * 数据实体解析结果：草稿 + 解析过程中的 warning 列表。
     * warnings 用于提示无法完全识别的类型、缺失注解等情况，不阻塞回填。
     */
    public record DataWorkbenchEntityParseResult(
            DataWorkbenchEntityDraft draft,
            List<String> warnings
    ) {
    }
}
