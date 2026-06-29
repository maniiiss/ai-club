package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ApiStudioDirectoryEntity;
import com.aiclub.platform.domain.model.ApiStudioEndpointEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointDetail;
import com.aiclub.platform.dto.apistudio.ApiStudioEndpointParameterItem;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.repository.ApiStudioDirectoryRepository;
import com.aiclub.platform.repository.ApiStudioEndpointRepository;
import com.aiclub.platform.service.apistudio.ApiStudioDirectoryService;
import com.aiclub.platform.service.apistudio.ApiStudioEndpointService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * 原生 API Studio 数据源实现：把 {@code api_studio_*} 表中的强类型 endpoint detail
 * 转换为 mimic 旧 Yaade {@code data} 形态的 JsonNode，复用 AI 测试用例生成的脱敏/Prompt 逻辑。
 */
@Service
@Transactional(readOnly = true)
public class ApiStudioTestContextSource implements ApiTestContextSource {

    private final ApiStudioEndpointService endpointService;
    private final ApiStudioDirectoryService directoryService;
    private final ApiStudioEndpointRepository endpointRepository;
    private final ApiStudioDirectoryRepository directoryRepository;
    private final ObjectMapper objectMapper;

    public ApiStudioTestContextSource(ApiStudioEndpointService endpointService,
                                      ApiStudioDirectoryService directoryService,
                                      ApiStudioEndpointRepository endpointRepository,
                                      ApiStudioDirectoryRepository directoryRepository,
                                      ObjectMapper objectMapper) {
        this.endpointService = endpointService;
        this.directoryService = directoryService;
        this.endpointRepository = endpointRepository;
        this.directoryRepository = directoryRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    public ApiTestGenerationContext requireContext(Long projectId, Long endpointId) {
        if (endpointId == null) {
            throw new IllegalArgumentException("endpointId 不能为空");
        }
        // 利用公开 API 同时承担权限校验（requireVisibleProject）和归属校验。
        ApiStudioEndpointDetail detail = endpointService.getDetail(projectId, endpointId);
        ApiStudioEndpointEntity entity = endpointRepository.findById(endpointId)
                .orElseThrow(() -> new NoSuchElementException("API 不存在: " + endpointId));
        if (!Objects.equals(entity.getProjectId(), projectId)) {
            throw new ForbiddenException("API 不属于当前项目");
        }
        ProjectEntity project = directoryService.requireVisibleProject(projectId);
        String directoryPath = resolveDirectoryPath(detail.directoryId());
        ObjectNode requestData = buildRequestData(detail);
        return new ApiTestGenerationContext(project, endpointId, directoryPath, requestData);
    }

    /**
     * 把 native 强类型 detail 组装成 mimic 旧 Yaade data 形态的 ObjectNode。
     * 字段对齐 {@code ApiTestCaseAiService.buildSanitizedRequestContext} 读取的 path。
     */
    private ObjectNode buildRequestData(ApiStudioEndpointDetail detail) {
        ObjectNode data = objectMapper.createObjectNode();
        data.put("name", nullToEmpty(detail.name()));
        data.put("method", nullToEmpty(detail.method()).toUpperCase(Locale.ROOT));
        data.put("uri", nullToEmpty(detail.path()));
        data.put("description", nullToEmpty(detail.descriptionMarkdown()));
        data.put("contentType", mapContentType(detail.requestBodyType()));
        data.put("body", nullToEmpty(detail.requestBodyExample()));

        ArrayNode headers = objectMapper.createArrayNode();
        ArrayNode params = objectMapper.createArrayNode();
        ArrayNode formDataBody = objectMapper.createArrayNode();
        if (detail.parameters() != null) {
            for (ApiStudioEndpointParameterItem p : detail.parameters()) {
                ObjectNode kv = buildParamNode(p);
                String loc = p.location() == null ? "" : p.location().toUpperCase(Locale.ROOT);
                switch (loc) {
                    case "HEADER" -> headers.add(kv);
                    case "QUERY", "PATH" -> params.add(kv);
                    case "FORM_DATA", "FORM_URLENCODED" -> formDataBody.add(kv);
                    default -> params.add(kv);
                }
            }
        }
        data.set("headers", headers);
        data.set("params", params);
        data.set("formDataBody", formDataBody);
        // auth 在 native 模型中由环境变量/调试覆盖承担，此处留空 ObjectNode 以与旧 schema 兼容。
        data.set("auth", objectMapper.createObjectNode());
        return data;
    }

    private ObjectNode buildParamNode(ApiStudioEndpointParameterItem p) {
        ObjectNode kv = objectMapper.createObjectNode();
        kv.put("key", nullToEmpty(p.name()));
        kv.put("value", firstNonNull(p.exampleValue(), p.defaultValue()));
        kv.put("description", nullToEmpty(p.description()));
        kv.put("required", Boolean.TRUE.equals(p.required()));
        kv.put("type", nullToEmpty(p.dataType()));
        return kv;
    }

    private String resolveDirectoryPath(Long directoryId) {
        if (directoryId == null) {
            return "根目录";
        }
        List<String> names = new ArrayList<>();
        Long cursor = directoryId;
        int safety = 0;
        while (cursor != null && safety++ < 64) {
            ApiStudioDirectoryEntity dir = directoryRepository.findById(cursor).orElse(null);
            if (dir == null) break;
            if (dir.getName() != null && !dir.getName().isBlank()) {
                names.add(0, dir.getName().trim());
            }
            cursor = dir.getParentId();
        }
        return names.isEmpty() ? "根目录" : String.join(" / ", names);
    }

    /**
     * 把 native 的 requestBodyType 映射回旧 Yaade contentType 字符串，保留 prompt 习惯。
     */
    private String mapContentType(String bodyType) {
        if (bodyType == null) return "none";
        return switch (bodyType.toUpperCase(Locale.ROOT)) {
            case "JSON" -> "application/json";
            case "FORM_DATA" -> "multipart/form-data";
            case "FORM_URLENCODED" -> "application/x-www-form-urlencoded";
            case "RAW_TEXT" -> "text/plain";
            case "NONE" -> "none";
            default -> "none";
        };
    }

    private String nullToEmpty(String v) {
        return v == null ? "" : v;
    }

    private String firstNonNull(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        if (b != null) return b;
        return "";
    }
}
