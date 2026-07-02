package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataChangeAuditEntity;
import com.aiclub.platform.domain.model.DataChangeRequestEntity;
import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeAuditItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeRequestItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchFieldItem;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DataWorkbench DTO 映射器。
 * 业务意图：统一处理 DSL/快照 JSON 与前端展示结构转换，避免控制器和服务重复解析。
 */
@Component
public class DataWorkbenchMapper {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public DataWorkbenchMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public DataWorkbenchEntityItem toEntityItem(DataWorkbenchEntity entity) {
        var project = entity.getPlatformProject();
        return new DataWorkbenchEntityItem(
                entity.getId(),
                entity.getEntityCode(),
                entity.getEntityName(),
                entity.getDescription(),
                entity.getTableName(),
                entity.getPrimaryKeyColumn(),
                project == null ? null : project.getId(),
                project == null ? "" : project.getName(),
                entity.getMaxAffectedRows(),
                entity.getRequestScope(),
                entity.getExecuteScope(),
                entity.getRollbackScope(),
                entity.isEnabled(),
                entity.getFields().stream()
                        .sorted((left, right) -> Integer.compare(left.getSortOrder(), right.getSortOrder()))
                        .map(this::toFieldItem)
                        .toList()
        );
    }

    public DataWorkbenchFieldItem toFieldItem(DataWorkbenchFieldEntity field) {
        return new DataWorkbenchFieldItem(
                field.getId(),
                field.getFieldCode(),
                field.getFieldName(),
                field.getColumnName(),
                field.getDataType(),
                field.getSynonyms(),
                field.isUpdatable(),
                field.isLocator(),
                field.isSensitive(),
                field.isEnabled(),
                field.getSortOrder()
        );
    }

    public DataChangeRequestItem toRequestItem(DataChangeRequestEntity request) {
        return new DataChangeRequestItem(
                request.getId(),
                request.getProject().getId(),
                request.getProject().getName(),
                request.getEntity().getId(),
                request.getEntity().getEntityCode(),
                request.getEntity().getEntityName(),
                request.getOriginalText(),
                parseDsl(request.getDslJson()),
                request.getPreviewSqlSummary(),
                request.getRiskLevel(),
                request.getApprovalStatus(),
                request.getExecutionStatus(),
                request.getRollbackStatus(),
                request.getAffectedRows(),
                splitLines(request.getRiskReasons()),
                request.getRejectReason(),
                request.getRollbackConflictReason(),
                userName(request.getRequesterUser()),
                userName(request.getApproverUser()),
                userName(request.getExecutorUser()),
                userName(request.getRollbackUser()),
                format(request.getCreatedAt()),
                format(request.getApprovedAt()),
                format(request.getExecutedAt()),
                format(request.getRolledBackAt())
        );
    }

    public DataChangeAuditItem toAuditItem(DataChangeAuditEntity audit) {
        return new DataChangeAuditItem(
                audit.getId(),
                audit.getRequest().getId(),
                audit.getEntity().getEntityName(),
                audit.getPrimaryKeyValue(),
                parseMap(audit.getBeforeSnapshot()),
                parseMap(audit.getAfterSnapshot()),
                audit.getSqlSummary(),
                audit.getRollbackStatus(),
                audit.getRollbackConflictReason(),
                format(audit.getCreatedAt()),
                format(audit.getRolledBackAt())
        );
    }

    public DataChangeDsl parseDsl(String json) {
        Map<String, Object> raw = parseMap(json);
        return new DataChangeDsl(
                string(raw.getOrDefault("version", "1")),
                string(raw.getOrDefault("operation", "UPDATE")),
                string(raw.get("entityCode")),
                nestedMap(raw.get("set")),
                nestedMap(raw.get("where"))
        );
    }

    public String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("DataWorkbench JSON 序列化失败", exception);
        }
    }

    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (Exception exception) {
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> nestedMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, item) -> result.put(String.valueOf(key), item));
        return result;
    }

    private List<String> splitLines(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String item : value.split("\\n")) {
            if (!item.isBlank()) {
                result.add(item.trim());
            }
        }
        return result;
    }

    private String userName(UserEntity user) {
        if (user == null) {
            return "";
        }
        return user.getNickname() == null || user.getNickname().isBlank() ? user.getUsername() : user.getNickname();
    }

    private String format(LocalDateTime time) {
        return time == null ? "" : TIME_FORMATTER.format(time);
    }

    private String string(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
