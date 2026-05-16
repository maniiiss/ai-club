package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.dto.YaadeApiRequestSummary;
import com.aiclub.platform.dto.YaadeProjectBindingSummary;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

/**
 * Yaade API 请求目录服务。
 * 平台不保存 Yaade 接口正文，因此 AI 测试用例生成前需要按项目权限读取当前 Yaade collection 子树快照。
 */
@Service
@Transactional(readOnly = true)
public class YaadeApiCatalogService {

    private final YaadeProjectSyncService yaadeProjectSyncService;
    private final YaadeClientService yaadeClientService;

    public YaadeApiCatalogService(YaadeProjectSyncService yaadeProjectSyncService,
                                  YaadeClientService yaadeClientService) {
        this.yaadeProjectSyncService = yaadeProjectSyncService;
        this.yaadeClientService = yaadeClientService;
    }

    public List<YaadeApiRequestSummary> listRequests(Long projectId) {
        ProjectCatalogSnapshot snapshot = loadProjectCatalogSnapshot(projectId);
        return snapshot.requestEntries().stream()
                .map(entry -> toSummary(entry, snapshot.collectionPathById()))
                .sorted(Comparator
                        .comparing(YaadeApiRequestSummary::collectionPath, Comparator.nullsLast(String::compareToIgnoreCase))
                        .thenComparing(YaadeApiRequestSummary::name, Comparator.nullsLast(String::compareToIgnoreCase))
                        .thenComparing(YaadeApiRequestSummary::requestId))
                .toList();
    }

    public RequestLookupResult requireRequest(Long projectId, Long requestId) {
        if (requestId == null) {
            throw new IllegalArgumentException("Yaade requestId 不能为空");
        }
        ProjectCatalogSnapshot snapshot = loadProjectCatalogSnapshot(projectId);
        return snapshot.requestEntries().stream()
                .filter(entry -> Objects.equals(entry.request().id(), requestId))
                .findFirst()
                .map(entry -> new RequestLookupResult(
                        snapshot.project(),
                        snapshot.binding(),
                        entry.collection(),
                        entry.request(),
                        snapshot.collectionPathById().getOrDefault(entry.collection().id(), entry.collection().name())
                ))
                .orElseThrow(() -> new NoSuchElementException("Yaade 请求不存在或不属于当前项目: " + requestId));
    }

    private ProjectCatalogSnapshot loadProjectCatalogSnapshot(Long projectId) {
        ProjectEntity project = yaadeProjectSyncService.requireVisibleProject(projectId);
        YaadeProjectBindingSummary binding = yaadeProjectSyncService.getBindingSummary(projectId);
        if (binding.yaadeCollectionId() == null) {
            throw new IllegalStateException("当前项目尚未初始化 Yaade collection，请先进入 API 工作台完成初始化");
        }
        YaadeClientService.YaadeSession adminSession = yaadeClientService.loginAdmin();
        List<YaadeClientService.YaadeRemoteCollection> collections = yaadeClientService.listCollectionsInSubtree(adminSession, binding.yaadeCollectionId());
        Map<Long, YaadeClientService.YaadeRemoteCollection> collectionById = new LinkedHashMap<>();
        for (YaadeClientService.YaadeRemoteCollection collection : collections) {
            collectionById.put(collection.id(), collection);
        }
        Map<Long, String> collectionPathById = new LinkedHashMap<>();
        for (YaadeClientService.YaadeRemoteCollection collection : collections) {
            collectionPathById.put(collection.id(), buildCollectionPath(collection, collectionById));
        }
        List<RequestEntry> requestEntries = new ArrayList<>();
        for (YaadeClientService.YaadeRemoteCollection collection : collections) {
            for (YaadeClientService.YaadeRemoteRequest request : yaadeClientService.listCollectionRequests(collection)) {
                if (isRestRequest(request)) {
                    requestEntries.add(new RequestEntry(collection, request));
                }
            }
        }
        return new ProjectCatalogSnapshot(project, binding, collectionPathById, requestEntries);
    }

    private YaadeApiRequestSummary toSummary(RequestEntry entry, Map<Long, String> collectionPathById) {
        JsonNode data = entry.request().data();
        return new YaadeApiRequestSummary(
                entry.request().id(),
                entry.collection().id(),
                collectionPathById.getOrDefault(entry.collection().id(), entry.collection().name()),
                firstNonBlank(data.path("name").asText(null), entry.request().id() == null ? "未命名请求" : "请求 " + entry.request().id()),
                defaultString(data.path("method").asText("GET"), "GET").toUpperCase(),
                normalizePath(data.path("uri").asText("/"))
        );
    }

    private String buildCollectionPath(YaadeClientService.YaadeRemoteCollection collection,
                                       Map<Long, YaadeClientService.YaadeRemoteCollection> collectionById) {
        List<String> names = new ArrayList<>();
        YaadeClientService.YaadeRemoteCollection current = collection;
        while (current != null) {
            if (hasText(current.name())) {
                names.add(0, current.name().trim());
            }
            current = current.parentId() == null ? null : collectionById.get(current.parentId());
        }
        return names.isEmpty() ? "根目录" : String.join(" / ", names);
    }

    private boolean isRestRequest(YaadeClientService.YaadeRemoteRequest request) {
        return request != null && "REST".equalsIgnoreCase(defaultString(request.type(), "REST"));
    }

    private String normalizePath(String path) {
        String normalized = defaultString(path, "/").trim();
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }
        return normalized.replaceAll("/{2,}", "/");
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private record ProjectCatalogSnapshot(
            ProjectEntity project,
            YaadeProjectBindingSummary binding,
            Map<Long, String> collectionPathById,
            List<RequestEntry> requestEntries
    ) {
    }

    private record RequestEntry(
            YaadeClientService.YaadeRemoteCollection collection,
            YaadeClientService.YaadeRemoteRequest request
    ) {
    }

    public record RequestLookupResult(
            ProjectEntity project,
            YaadeProjectBindingSummary binding,
            YaadeClientService.YaadeRemoteCollection collection,
            YaadeClientService.YaadeRemoteRequest request,
            String collectionPath
    ) {
    }
}
