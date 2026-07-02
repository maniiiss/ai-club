package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.DataWorkbenchFieldEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.repository.DataWorkbenchEntityRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * DataChange DSL 解析服务。
 * 业务意图：首期先提供稳定的规则解析和 DSL 归一化入口；模型接入后也只能产出同一份 DSL。
 */
@Service
public class DataChangeDslService {

    private final DataWorkbenchEntityRepository entityRepository;

    public DataChangeDslService(DataWorkbenchEntityRepository entityRepository) {
        this.entityRepository = entityRepository;
    }

    /**
     * 将自然语言或显式 DSL 归一化为 v1 单实体 UPDATE DSL。
     */
    public DataChangeDsl resolveDsl(Long projectId, String text, String entityCode, Map<String, Object> explicitDsl) {
        if (explicitDsl != null && !explicitDsl.isEmpty()) {
            return normalizeDsl(explicitDsl, entityCode);
        }
        DataWorkbenchEntity entity = resolveEntity(entityCode);
        String normalizedText = defaultString(text);
        LinkedHashMap<String, Object> set = new LinkedHashMap<>();
        LinkedHashMap<String, Object> where = new LinkedHashMap<>();

        for (DataWorkbenchFieldEntity field : entity.getFields()) {
            if (!field.isEnabled()) {
                continue;
            }
            if (field.isUpdatable()) {
                Object value = extractSetValue(normalizedText, field);
                if (value != null) {
                    set.put(field.getFieldCode(), value);
                }
            }
            if (field.isLocator()) {
                Object value = extractLocatorValue(normalizedText, field);
                if (value != null) {
                    where.put(field.getFieldCode(), value);
                }
            }
        }
        where.put("projectId", projectId);
        return new DataChangeDsl("1", "UPDATE", entity.getEntityCode(), set, where);
    }

    private DataChangeDsl normalizeDsl(Map<String, Object> raw, String fallbackEntityCode) {
        String operation = stringValue(raw.getOrDefault("operation", "UPDATE")).toUpperCase(Locale.ROOT);
        String version = stringValue(raw.getOrDefault("version", "1"));
        String entityCode = stringValue(raw.get("entityCode"));
        if (entityCode.isBlank()) {
            entityCode = defaultString(fallbackEntityCode);
        }
        return new DataChangeDsl(
                version.isBlank() ? "1" : version,
                operation.isBlank() ? "UPDATE" : operation,
                entityCode,
                mapValue(raw.get("set")),
                mapValue(raw.get("where"))
        );
    }

    private DataWorkbenchEntity resolveEntity(String entityCode) {
        if (entityCode != null && !entityCode.isBlank()) {
            return entityRepository.findWithFieldsByEntityCode(entityCode.trim())
                    .orElseThrow(() -> new NoSuchElementException("DataWorkbench 实体不存在: " + entityCode));
        }
        return entityRepository.findAllByEnabledTrueOrderByIdAsc().stream()
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("请先配置 DataWorkbench 实体"));
    }

    private Object extractSetValue(String text, DataWorkbenchFieldEntity field) {
        for (String alias : aliases(field)) {
            String bracketPattern = "【" + alias + "】";
            int bracketIndex = text.indexOf(bracketPattern);
            if (bracketIndex >= 0) {
                String tail = text.substring(bracketIndex + bracketPattern.length());
                Object value = extractAfterMarker(tail);
                if (value != null) {
                    return value;
                }
            }
            int index = text.indexOf(alias);
            if (index >= 0) {
                Object value = extractAfterMarker(text.substring(index + alias.length()));
                if (value != null) {
                    return value;
                }
            }
        }
        return null;
    }

    private Object extractLocatorValue(String text, DataWorkbenchFieldEntity field) {
        for (String alias : aliases(field)) {
            int index = text.indexOf(alias);
            if (index < 0) {
                continue;
            }
            String tail = text.substring(index + alias.length()).trim();
            String markerTrimmed = stripLeadingMarkers(tail);
            if (markerTrimmed.isBlank()) {
                continue;
            }
            String value = markerTrimmed.split("[\\s，,。；;]", 2)[0].trim();
            if (!value.isBlank()) {
                return trimQuotes(value);
            }
        }
        return null;
    }

    private Object extractAfterMarker(String tail) {
        String normalized = stripLeadingMarkers(tail);
        if (normalized.isBlank()) {
            return null;
        }
        String value;
        if (normalized.startsWith("「")) {
            int end = normalized.indexOf("」", 1);
            value = end > 0 ? normalized.substring(1, end) : normalized.substring(1);
        } else if (normalized.startsWith("\"")) {
            int end = normalized.indexOf("\"", 1);
            value = end > 0 ? normalized.substring(1, end) : normalized.substring(1);
        } else {
            value = normalized.split("[\\s，,。；;]", 2)[0];
        }
        value = trimQuotes(value);
        if ("是".equals(value)) {
            return true;
        }
        if ("否".equals(value)) {
            return false;
        }
        return value.isBlank() ? null : value;
    }

    private String stripLeadingMarkers(String value) {
        String result = defaultString(value);
        while (!result.isBlank()) {
            String before = result;
            // 同义词可能命中在中文括号内部，例如“资审”命中“【是否资审】”，这里一并吃掉右括号和连接词。
            result = result.replaceFirst("^(为|改为|修改为|变更为|=|：|:|「|】|\\]|\\s)+", "").trim();
            if (before.equals(result)) {
                break;
            }
        }
        return result;
    }

    private String[] aliases(DataWorkbenchFieldEntity field) {
        String merged = field.getFieldName() + "," + field.getFieldCode() + "," + field.getColumnName() + "," + defaultString(field.getSynonyms());
        return java.util.Arrays.stream(merged.split("[,，]"))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .distinct()
                .toArray(String[]::new);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> mapValue(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, item) -> result.put(String.valueOf(key), item));
        return result;
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String trimQuotes(String value) {
        return defaultString(value)
                .replaceAll("^[「『“”\"'【\\[]+", "")
                .replaceAll("[」』“”\"'】\\]]+$", "")
                .trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
