package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.HermesFileLibraryItemEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.HermesFileLibraryItemSummary;
import com.aiclub.platform.dto.request.UpdateHermesFileLibraryItemRequest;
import com.aiclub.platform.repository.HermesFileLibraryItemRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * Hermes 个人文件库服务。
 * 业务意图：把用户上传的长期参考文档转成 Markdown 后写入 Qdrant 向量索引，
 * 让普通 Hermes 问答也能召回个人知识，同时保持用户归属隔离。
 */
@Service
@Transactional(readOnly = true)
public class HermesFileLibraryService {

    public static final String INDEX_STATUS_PENDING = "PENDING";
    public static final String INDEX_STATUS_INDEXED = "INDEXED";
    public static final String INDEX_STATUS_FAILED = "FAILED";

    private static final Logger log = LoggerFactory.getLogger(HermesFileLibraryService.class);
    private static final String UPLOAD_DIRECTORY = "hermes-file-library";
    private static final int RECALL_LIMIT = 5;
    private static final int MAX_EVIDENCE_SNIPPET_LENGTH = 500;
    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final AuthService authService;
    private final DocumentAssetService documentAssetService;
    private final DocumentMarkdownService documentMarkdownService;
    private final HermesFileLibraryItemRepository hermesFileLibraryItemRepository;
    private final WikiKnowledgeProperties wikiKnowledgeProperties;
    private final WikiChunkingService wikiChunkingService;
    private final ModelConfigService modelConfigService;
    private final QdrantClientService qdrantClientService;
    private final ObjectMapper objectMapper;

    public HermesFileLibraryService(AuthService authService,
                                    DocumentAssetService documentAssetService,
                                    DocumentMarkdownService documentMarkdownService,
                                    HermesFileLibraryItemRepository hermesFileLibraryItemRepository,
                                    WikiKnowledgeProperties wikiKnowledgeProperties,
                                    WikiChunkingService wikiChunkingService,
                                    ModelConfigService modelConfigService,
                                    QdrantClientService qdrantClientService,
                                    ObjectMapper objectMapper) {
        this.authService = authService;
        this.documentAssetService = documentAssetService;
        this.documentMarkdownService = documentMarkdownService;
        this.hermesFileLibraryItemRepository = hermesFileLibraryItemRepository;
        this.wikiKnowledgeProperties = wikiKnowledgeProperties;
        this.wikiChunkingService = wikiChunkingService;
        this.modelConfigService = modelConfigService;
        this.qdrantClientService = qdrantClientService;
        this.objectMapper = objectMapper;
    }

    /**
     * 上传并索引当前用户的个人文件库文档。
     */
    @Transactional
    public HermesFileLibraryItemSummary upload(MultipartFile file) {
        CurrentUserInfo currentUser = authService.currentUser();
        DocumentAssetSummary assetSummary = documentAssetService.uploadAsset(file, UPLOAD_DIRECTORY);
        DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(assetSummary.id());
        DocumentMarkdownResult converted = documentMarkdownService.convert(asset.getId(), DocumentMarkdownService.SCENE_HERMES_FILE_LIBRARY, null);

        HermesFileLibraryItemEntity item = new HermesFileLibraryItemEntity();
        item.setOwnerUser(asset.getOwnerUser());
        item.setDocumentAsset(asset);
        item.setTitle(firstNonBlank(converted.suggestedTitle(), asset.getFileName()));
        item.setDescription("");
        item.setMarkdown(defaultString(converted.markdown()));
        item.setSourceFormat(firstNonBlank(converted.sourceFormat(), asset.getSourceFormat()));
        item.setFileSize(asset.getFileSize());
        item.setEnabled(true);
        item.setIndexStatus(INDEX_STATUS_PENDING);
        item.setWarningsJson(writeWarnings(converted.warnings()));
        item.setLastError("");

        HermesFileLibraryItemEntity saved = hermesFileLibraryItemRepository.save(item);
        documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_HERMES_FILE_LIBRARY, saved.getId());
        indexItem(currentUser, saved);
        return toSummary(saved);
    }

    /**
     * 列出当前用户的文件库条目，query 为空时返回当前用户全部条目。
     */
    public List<HermesFileLibraryItemSummary> list(String query) {
        CurrentUserInfo currentUser = authService.currentUser();
        String keyword = defaultString(query);
        return hermesFileLibraryItemRepository
                .findAllByOwnerUser_IdAndTitleContainingIgnoreCaseOrderByUpdatedAtDescIdDesc(currentUser.id(), keyword)
                .stream()
                .map(this::toSummary)
                .toList();
    }

    /**
     * 更新标题、描述或启停状态；启停只影响后续召回，不删除已索引内容。
     */
    @Transactional
    public HermesFileLibraryItemSummary update(Long id, UpdateHermesFileLibraryItemRequest request) {
        HermesFileLibraryItemEntity item = requireOwnedItem(id);
        if (request != null && request.title() != null) {
            item.setTitle(defaultString(request.title()));
        }
        if (request != null && request.description() != null) {
            item.setDescription(defaultString(request.description()));
        }
        if (request != null && request.enabled() != null) {
            item.setEnabled(request.enabled());
        }
        return toSummary(hermesFileLibraryItemRepository.save(item));
    }

    /**
     * 删除当前用户文件库条目，并同步删除对应 Qdrant 向量索引。
     */
    @Transactional
    public void delete(Long id) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesFileLibraryItemEntity item = requireOwnedItem(id, currentUser);
        deleteVectorIndex(currentUser.id(), item.getId());
        hermesFileLibraryItemRepository.delete(item);
    }

    /**
     * 重新读取原始资产并刷新 Markdown / Qdrant 向量索引。
     */
    @Transactional
    public HermesFileLibraryItemSummary reindex(Long id) {
        CurrentUserInfo currentUser = authService.currentUser();
        HermesFileLibraryItemEntity item = requireOwnedItem(id, currentUser);
        item.setIndexStatus(INDEX_STATUS_PENDING);
        item.setLastError("");
        try {
            DocumentMarkdownResult converted = documentMarkdownService.convert(
                    item.getDocumentAsset().getId(),
                    DocumentMarkdownService.SCENE_HERMES_FILE_LIBRARY,
                    null
            );
            item.setTitle(firstNonBlank(converted.suggestedTitle(), item.getTitle(), item.getDocumentAsset().getFileName()));
            item.setMarkdown(defaultString(converted.markdown()));
            item.setSourceFormat(firstNonBlank(converted.sourceFormat(), item.getDocumentAsset().getSourceFormat()));
            item.setFileSize(item.getDocumentAsset().getFileSize());
            item.setWarningsJson(writeWarnings(converted.warnings()));
            indexItem(currentUser, item);
        } catch (RuntimeException exception) {
            item.setIndexStatus(INDEX_STATUS_FAILED);
            item.setLastError(sanitizeWarning(exception));
        }
        return toSummary(hermesFileLibraryItemRepository.save(item));
    }

    /**
     * 为 Hermes Prompt 召回个人文件库证据；失败时降级为空，避免阻塞主问答。
     */
    public String buildEvidenceMarkdown(CurrentUserInfo currentUser, String query) {
        if (currentUser == null || currentUser.id() == null || defaultString(query).isBlank()) {
            return "";
        }
        List<HermesFileLibraryItemEntity> enabledItems = hermesFileLibraryItemRepository
                .findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(currentUser.id());
        Set<Long> indexedItemIds = enabledItems.stream()
                .filter(item -> INDEX_STATUS_INDEXED.equals(defaultString(item.getIndexStatus())))
                .map(HermesFileLibraryItemEntity::getId)
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        if (indexedItemIds.isEmpty()) {
            return "";
        }
        try {
            List<QdrantClientService.QdrantSearchHit> hits = qdrantClientService.search(
                    wikiKnowledgeProperties.getHermesFileLibraryCollection(),
                    generateEmbedding(query),
                    Map.of("ownerUserId", currentUser.id(), "enabled", true),
                    RECALL_LIMIT
            );
            String evidence = renderEvidence(hits, indexedItemIds);
            if (hasText(evidence)) {
                return evidence;
            }
            return renderLexicalFallbackEvidence(enabledItems, indexedItemIds, query);
        } catch (RuntimeException exception) {
            log.warn("Hermes 个人文件库证据召回失败，userId={}：{}", currentUser.id(), sanitizeWarning(exception));
            return "";
        }
    }

    private void indexItem(CurrentUserInfo currentUser, HermesFileLibraryItemEntity item) {
        try {
            upsertVectorIndex(currentUser.id(), item);
            item.setIndexStatus(INDEX_STATUS_INDEXED);
            item.setLastError("");
        } catch (RuntimeException exception) {
            item.setIndexStatus(INDEX_STATUS_FAILED);
            item.setLastError(sanitizeWarning(exception));
        }
    }

    private HermesFileLibraryItemEntity requireOwnedItem(Long id) {
        return requireOwnedItem(id, authService.currentUser());
    }

    private HermesFileLibraryItemEntity requireOwnedItem(Long id, CurrentUserInfo currentUser) {
        if (currentUser == null || currentUser.id() == null) {
            throw new IllegalArgumentException("当前用户信息缺失");
        }
        return hermesFileLibraryItemRepository.findByIdAndOwnerUser_Id(id, currentUser.id())
                .orElseThrow(() -> new NoSuchElementException("文件库条目不存在"));
    }

    private void upsertVectorIndex(Long userId, HermesFileLibraryItemEntity item) {
        if (!isVectorIndexEnabled()) {
            throw new IllegalStateException("Hermes 文件库向量索引未启用或未配置 Embedding 模型");
        }
        deleteVectorIndex(userId, item.getId());
        List<WikiChunkingService.WikiChunk> chunks = wikiChunkingService.chunkMarkdown(
                "hermes-file-library",
                item.getId(),
                1,
                item.getTitle(),
                "个人文件库 / " + item.getTitle(),
                item.getMarkdown()
        );
        if (chunks.isEmpty()) {
            throw new IllegalStateException("文件未生成可向量化切片，请重新向量化");
        }
        List<List<Double>> vectors = generateEmbeddings(chunks.stream().map(WikiChunkingService.WikiChunk::content).toList());
        if (vectors.isEmpty() || vectors.size() != chunks.size()) {
            throw new IllegalStateException("文件切片向量化未完成，请重新向量化");
        }
        qdrantClientService.createCollection(wikiKnowledgeProperties.getHermesFileLibraryCollection(), vectors.get(0).size());
        List<QdrantClientService.QdrantPoint> points = new ArrayList<>();
        for (int index = 0; index < chunks.size() && index < vectors.size(); index++) {
            WikiChunkingService.WikiChunk chunk = chunks.get(index);
            LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
            payload.put("sourceType", "HERMES_FILE_LIBRARY");
            payload.put("ownerUserId", userId);
            payload.put("itemId", item.getId());
            payload.put("assetId", item.getDocumentAsset() == null ? null : item.getDocumentAsset().getId());
            payload.put("fileName", item.getDocumentAsset() == null ? "" : item.getDocumentAsset().getFileName());
            payload.put("title", item.getTitle());
            payload.put("description", item.getDescription());
            payload.put("sourceFormat", item.getSourceFormat());
            payload.put("enabled", item.isEnabled());
            payload.put("chunkId", chunk.chunkId());
            payload.put("chunkOrder", chunk.chunkOrder());
            payload.put("sectionTitle", chunk.sectionTitle());
            payload.put("path", chunk.path());
            payload.put("content", chunk.content());
            payload.put("plainText", chunk.plainText());
            payload.put("tokenCount", chunk.tokenCount());
            points.add(new QdrantClientService.QdrantPoint(chunk.chunkId(), vectors.get(index), Map.copyOf(payload)));
        }
        qdrantClientService.upsertPoints(wikiKnowledgeProperties.getHermesFileLibraryCollection(), points);
    }

    private void deleteVectorIndex(Long userId, Long itemId) {
        if (qdrantClientService == null || wikiKnowledgeProperties == null || userId == null || itemId == null) {
            return;
        }
        qdrantClientService.deletePointsByFilter(
                wikiKnowledgeProperties.getHermesFileLibraryCollection(),
                Map.of("ownerUserId", userId, "itemId", itemId)
        );
    }

    private boolean isVectorIndexEnabled() {
        return wikiKnowledgeProperties != null
                && wikiKnowledgeProperties.isEnabled()
                && wikiKnowledgeProperties.hasEmbeddingConfig()
                && qdrantClientService != null
                && modelConfigService != null
                && wikiChunkingService != null;
    }

    private List<Double> generateEmbedding(String input) {
        if (wikiKnowledgeProperties.hasEmbeddingModelId()) {
            return modelConfigService.generateEmbedding(wikiKnowledgeProperties.getEmbeddingModelId(), input);
        }
        return modelConfigService.generateEmbedding(resolveFixedEmbeddingConfig(), input);
    }

    private List<List<Double>> generateEmbeddings(List<String> inputs) {
        if (wikiKnowledgeProperties.hasEmbeddingModelId()) {
            return modelConfigService.generateEmbeddings(wikiKnowledgeProperties.getEmbeddingModelId(), inputs);
        }
        return modelConfigService.generateEmbeddings(resolveFixedEmbeddingConfig(), inputs);
    }

    private ModelConfigService.ResolvedModelConfig resolveFixedEmbeddingConfig() {
        return new ModelConfigService.ResolvedModelConfig(
                null,
                "Hermes 文件库向量模型",
                ModelConfigService.MODEL_TYPE_EMBEDDING,
                wikiKnowledgeProperties.getEmbeddingProvider(),
                wikiKnowledgeProperties.getEmbeddingBaseUrl(),
                wikiKnowledgeProperties.getEmbeddingModelName(),
                ModelConfigService.OPENAI_API_MODE_AUTO,
                wikiKnowledgeProperties.getEmbeddingApiKey()
        );
    }

    private String renderEvidence(List<QdrantClientService.QdrantSearchHit> hits, Set<Long> indexedItemIds) {
        if (hits == null || hits.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("#### 个人文件库证据\n");
        boolean hasEvidence = false;
        for (QdrantClientService.QdrantSearchHit hit : hits) {
            Map<String, Object> payload = hit == null || hit.payload() == null ? Map.of() : hit.payload();
            if (!isIndexedHit(payload, indexedItemIds)) {
                continue;
            }
            String snippet = defaultString(stringValue(payload.get("plainText")));
            if (snippet.isBlank()) {
                continue;
            }
            builder.append("- ")
                    .append(firstNonBlank(stringValue(payload.get("title")), stringValue(payload.get("fileName")), "未命名文件"))
                    .append("：")
                    .append(abbreviate(snippet, MAX_EVIDENCE_SNIPPET_LENGTH))
                    .append('\n');
            hasEvidence = true;
        }
        return hasEvidence ? builder.toString().trim() : "";
    }

    /**
     * 向量召回可能因为短人名、文件名式问题或 embedding 分词不稳定而 miss。
     * 对显式文件库问答做标题 / 文件名 / 描述的轻量兜底，只返回已启用且已索引成功的文件，避免把失败索引内容伪装成可靠证据。
     */
    private String renderLexicalFallbackEvidence(List<HermesFileLibraryItemEntity> enabledItems,
                                                 Set<Long> indexedItemIds,
                                                 String query) {
        if (enabledItems == null || enabledItems.isEmpty() || indexedItemIds == null || indexedItemIds.isEmpty() || !hasText(query)) {
            return "";
        }
        List<String> queryTokens = extractQueryTokens(query);
        if (queryTokens.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder("#### 个人文件库证据\n");
        int count = 0;
        for (HermesFileLibraryItemEntity item : enabledItems) {
            if (item == null || item.getId() == null || !indexedItemIds.contains(item.getId())) {
                continue;
            }
            String searchableText = String.join(" ",
                    defaultString(item.getTitle()),
                    item.getDocumentAsset() == null ? "" : defaultString(item.getDocumentAsset().getFileName()),
                    defaultString(item.getDescription())
            );
            if (!matchesAnyToken(searchableText, queryTokens)) {
                continue;
            }
            String snippet = firstNonBlank(item.getMarkdown(), item.getDescription(), item.getTitle());
            if (!hasText(snippet)) {
                continue;
            }
            builder.append("- ")
                    .append(firstNonBlank(item.getTitle(), item.getDocumentAsset() == null ? "" : item.getDocumentAsset().getFileName(), "未命名文件"))
                    .append("（文件标题命中）：")
                    .append(abbreviate(stripMarkdown(snippet), MAX_EVIDENCE_SNIPPET_LENGTH))
                    .append('\n');
            count++;
            if (count >= RECALL_LIMIT) {
                break;
            }
        }
        return count > 0 ? builder.toString().trim() : "";
    }

    private List<String> extractQueryTokens(String query) {
        String normalized = defaultString(query)
                .replaceAll("[\\p{Punct}\\s]+", " ")
                .replaceAll("[，。！？、；：（）【】《》“”‘’]+", " ")
                .trim();
        if (!hasText(normalized)) {
            return List.of();
        }
        List<String> tokens = new ArrayList<>();
        for (String token : normalized.split("\\s+")) {
            String compactToken = token.trim();
            for (String candidate : expandQueryToken(compactToken)) {
                if (candidate.length() >= 2 && !isGenericQueryToken(candidate) && !tokens.contains(candidate)) {
                    tokens.add(candidate);
                }
            }
        }
        return tokens;
    }

    private List<String> expandQueryToken(String token) {
        String compactToken = defaultString(token);
        if (!hasText(compactToken)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        result.add(compactToken);
        for (String suffix : List.of("是谁", "是什么", "有哪些", "是什么人", "的内容", "相关资料", "相关文档")) {
            if (compactToken.endsWith(suffix) && compactToken.length() > suffix.length()) {
                result.add(compactToken.substring(0, compactToken.length() - suffix.length()));
            }
        }
        return result;
    }

    private boolean matchesAnyToken(String text, List<String> queryTokens) {
        String normalizedText = defaultString(text).toLowerCase(java.util.Locale.ROOT);
        if (!hasText(normalizedText)) {
            return false;
        }
        return queryTokens.stream()
                .map(token -> token.toLowerCase(java.util.Locale.ROOT))
                .anyMatch(normalizedText::contains);
    }

    private boolean isGenericQueryToken(String token) {
        return List.of("是谁", "什么", "哪些", "文件", "文档", "资料", "简历", "介绍", "内容", "相关").contains(token);
    }

    private String stripMarkdown(String value) {
        return defaultString(value)
                .replaceAll("(?m)^#{1,6}\\s*", "")
                .replaceAll("(?m)^[-*+]\\s+", "")
                .replaceAll("\\*\\*([^*]+)\\*\\*", "$1")
                .replaceAll("`([^`]+)`", "$1")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private boolean isIndexedHit(Map<String, Object> payload, Set<Long> indexedItemIds) {
        if (payload == null || indexedItemIds == null || indexedItemIds.isEmpty()) {
            return false;
        }
        Object itemId = payload.get("itemId");
        if (itemId instanceof Number number) {
            return indexedItemIds.contains(number.longValue());
        }
        if (itemId instanceof String text && hasText(text)) {
            try {
                return indexedItemIds.contains(Long.parseLong(text.trim()));
            } catch (NumberFormatException exception) {
                return false;
            }
        }
        return false;
    }

    private HermesFileLibraryItemSummary toSummary(HermesFileLibraryItemEntity item) {
        DocumentAssetEntity asset = item.getDocumentAsset();
        return new HermesFileLibraryItemSummary(
                item.getId(),
                asset == null ? null : asset.getId(),
                asset == null ? "" : defaultString(asset.getFileName()),
                defaultString(item.getTitle()),
                defaultString(item.getDescription()),
                defaultString(item.getSourceFormat()),
                item.getFileSize(),
                item.isEnabled(),
                defaultString(item.getIndexStatus()),
                readWarnings(item.getWarningsJson()),
                defaultString(item.getLastError()),
                item.getCreatedAt() == null ? "" : DATE_TIME_FORMATTER.format(item.getCreatedAt()),
                item.getUpdatedAt() == null ? "" : DATE_TIME_FORMATTER.format(item.getUpdatedAt())
        );
    }

    private String writeWarnings(List<String> warnings) {
        try {
            return objectMapper.writeValueAsString(warnings == null ? List.of() : warnings);
        } catch (Exception exception) {
            return "[]";
        }
    }

    private List<String> readWarnings(String warningsJson) {
        if (!hasText(warningsJson)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(warningsJson, new TypeReference<List<String>>() {
            });
        } catch (Exception exception) {
            return List.of();
        }
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

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    private String sanitizeWarning(RuntimeException exception) {
        String message = exception == null ? "" : defaultString(exception.getMessage());
        if (message.isBlank()) {
            return "未知错误";
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

}
