package com.aiclub.platform.service;

import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.service.QdrantClientService.QdrantPoint;
import com.aiclub.platform.service.QdrantClientService.QdrantSearchHit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 平台工具语义向量索引。
 *
 * <p>业务意图：为按需下发工具提供向量召回能力。把平台可见工具的名称、描述与补充关键词
 * 向量化后写入 Qdrant（{@code platform_tools} collection），用户问题向量检索时返回
 * 相关 toolCode，作为规则匹配未命中时的兜底召回。
 *
 * <p>降级策略：embedding 未配置（复用 {@link WikiKnowledgeProperties} 的 embedding 配置）
 * 或 Qdrant 不可用时，{@link #isEnabled()} 返回 false，{@link #search} 直接返回空列表，
 * 调用方回退到规则匹配或核心工具集。索引懒加载：首次检索时构建，失败不阻断主链路。
 */
@Service
public class PlatformToolSemanticIndex {

    private static final Logger log = LoggerFactory.getLogger(PlatformToolSemanticIndex.class);
    /** 工具向量集合名，与 Wiki 的 wiki_project_chunks 等独立，避免误删。 */
    static final String COLLECTION = "platform_tools";

    /**
     * 工具补充关键词，提升向量召回质量。
     * 关键词源自工具描述与 AssistantToolOrchestrator 已沉淀的意图词表，覆盖用户常见表达。
     */
    private static final Map<String, String> KEYWORDS = Map.ofEntries(
            Map.entry(PlatformToolRegistry.TOOL_PROJECT_SEARCH, "项目 列表 搜索 哪些项目 多少项目 概览"),
            Map.entry(PlatformToolRegistry.TOOL_PROJECT_GET_DETAIL, "项目详情 项目信息 成员 概况 当前项目"),
            Map.entry(PlatformToolRegistry.TOOL_PROJECT_LIST_ITERATIONS, "迭代 迭代列表 发版 sprint 版本"),
            Map.entry(PlatformToolRegistry.TOOL_PROJECT_GET_ITERATION_DETAIL, "迭代详情 发版内容 工作项统计 进度 交付"),
            Map.entry(PlatformToolRegistry.TOOL_USER_RESOLVE_PROJECT_MEMBER, "成员 解析 负责人 昵称 用户名 谁是"),
            Map.entry(PlatformToolRegistry.TOOL_USER_LIST_PROJECT_MEMBERS, "成员列表 项目成员 团队 负责人"),
            Map.entry(PlatformToolRegistry.TOOL_WORK_ITEM_SEARCH, "需求 任务 缺陷 工作项 bug 搜索 哪些 多少 列表"),
            Map.entry(PlatformToolRegistry.TOOL_WORK_ITEM_GET_DETAIL, "工作项详情 需求详情 任务详情 缺陷详情 评论"),
            Map.entry(PlatformToolRegistry.TOOL_WORK_ITEM_CREATE_DRAFT, "创建需求 新建任务 提缺陷 建工作项 create"),
            Map.entry(PlatformToolRegistry.TOOL_AGENT_LIST_AVAILABLE, "agent 智能体 助手 可用 列表"),
            Map.entry(PlatformToolRegistry.TOOL_AGENT_GET_DETAIL, "agent详情 智能体详情 能力 接入"),
            Map.entry(PlatformToolRegistry.TOOL_GITLAB_BINDING_SEARCH, "仓库 gitlab 绑定 代码仓库 搜索"),
            Map.entry(PlatformToolRegistry.TOOL_REPO_SCAN_LIST_RULESETS, "扫描规则集 规则 规范 规则集"),
            Map.entry(PlatformToolRegistry.TOOL_REPO_SCAN_START, "仓库扫描 发起扫描 规范扫描 代码扫描 scan"),
            Map.entry(PlatformToolRegistry.TOOL_REPO_SCAN_SEARCH, "扫描任务 扫描记录 扫描结果 仓库扫描"),
            Map.entry(PlatformToolRegistry.TOOL_EXECUTION_TASK_SEARCH, "执行任务 运行 任务执行 搜索 流水线"),
            Map.entry(PlatformToolRegistry.TOOL_EXECUTION_TASK_GET_DETAIL, "执行任务详情 步骤 产物 运行记录"),
            Map.entry(PlatformToolRegistry.TOOL_EXECUTION_TASK_CREATE, "创建执行任务 执行中心任务 触发执行"),
            Map.entry(PlatformToolRegistry.TOOL_TEST_PLAN_SEARCH, "测试计划 测试 搜索 哪些测试计划"),
            Map.entry(PlatformToolRegistry.TOOL_TEST_PLAN_GET_DETAIL, "测试计划详情 测试用例 用例"),
            Map.entry(PlatformToolRegistry.TOOL_TEST_PLAN_CREATE_DRAFT, "创建测试计划 新建测试计划"),
            Map.entry(PlatformToolRegistry.TOOL_DOCUMENT_CONVERT_MARKDOWN, "文档 转markdown 附件 文档转换 导入wiki"),
            Map.entry(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH, "wiki 知识库 页面 搜索 文档"),
            Map.entry(PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL, "wiki页面 页面详情 知识 正文")
    );

    private final QdrantClientService qdrantClientService;
    private final ModelConfigService modelConfigService;
    private final WikiKnowledgeProperties wikiProperties;
    private final PlatformToolRegistry platformToolRegistry;

    /** 懒加载标志：首次检索时构建索引，构建失败置 false 由下次重试。 */
    private volatile boolean indexed = false;

    public PlatformToolSemanticIndex(QdrantClientService qdrantClientService,
                                     ModelConfigService modelConfigService,
                                     WikiKnowledgeProperties wikiProperties,
                                     PlatformToolRegistry platformToolRegistry) {
        this.qdrantClientService = qdrantClientService;
        this.modelConfigService = modelConfigService;
        this.wikiProperties = wikiProperties;
        this.platformToolRegistry = platformToolRegistry;
    }

    /** 向量兜底是否可用：embedding 必须已配置（复用 Wiki 的 embedding 模型）。 */
    public boolean isEnabled() {
        return wikiProperties.hasEmbeddingConfig();
    }

    /**
     * 按用户问题召回相关 toolCode，失败或未启用时返回空列表，不抛异常。
     */
    public List<String> search(String question, int topK) {
        if (!isEnabled() || question == null || question.isBlank()) {
            return List.of();
        }
        ensureIndexed();
        if (!indexed) {
            return List.of();
        }
        try {
            List<Double> vector = generateEmbedding(question);
            List<QdrantSearchHit> hits = qdrantClientService.search(COLLECTION, vector, null, Math.max(1, topK));
            return hits.stream()
                    .map(hit -> hit.payload().get("toolCode"))
                    .filter(Objects::nonNull)
                    .map(String::valueOf)
                    .filter(code -> !code.isBlank())
                    .distinct()
                    .toList();
        } catch (RuntimeException ex) {
            log.warn("平台工具向量检索失败，本次降级为空召回：{}", ex.getMessage());
            return List.of();
        }
    }

    /** 强制重建索引，供管理端或测试调用。 */
    public synchronized void reindex() {
        indexed = false;
        ensureIndexed();
    }

    private void ensureIndexed() {
        if (indexed) {
            return;
        }
        synchronized (this) {
            if (indexed) {
                return;
            }
            try {
                indexAll();
                indexed = true;
            } catch (RuntimeException ex) {
                log.warn("平台工具向量索引构建失败，向量兜底降级：{}", ex.getMessage());
                indexed = false;
            }
        }
    }

    /**
     * 把平台可见工具的富文本描述向量化并写入 Qdrant。
     * 复用 Wiki 的 embedding 配置与 QdrantClientService，collection 不存在时自动创建。
     */
    void indexAll() {
        List<PlatformToolDefinition> tools = platformToolRegistry.listDefinitions();
        if (tools.isEmpty()) {
            return;
        }
        List<String> texts = tools.stream().map(this::buildEnrichedText).toList();
        List<List<Double>> vectors = generateEmbeddings(texts);
        if (vectors.isEmpty()) {
            return;
        }
        qdrantClientService.createCollection(COLLECTION, vectors.get(0).size());
        List<QdrantPoint> points = new ArrayList<>(tools.size());
        for (int i = 0; i < tools.size(); i++) {
            PlatformToolDefinition tool = tools.get(i);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("toolCode", tool.code());
            payload.put("toolName", tool.name());
            payload.put("moduleCode", tool.moduleCode());
            payload.put("description", tool.description());
            points.add(new QdrantPoint("tool:" + tool.code(), vectors.get(i), payload));
        }
        qdrantClientService.upsertPoints(COLLECTION, points);
    }

    private String buildEnrichedText(PlatformToolDefinition tool) {
        String keywords = KEYWORDS.getOrDefault(tool.code(), "");
        return String.join(" ", tool.name(), tool.description(), tool.moduleCode(), keywords);
    }

    private List<Double> generateEmbedding(String input) {
        if (wikiProperties.hasEmbeddingModelId()) {
            return modelConfigService.generateEmbedding(wikiProperties.getEmbeddingModelId(), input);
        }
        return modelConfigService.generateEmbedding(resolveFixedEmbeddingConfig(), input);
    }

    private List<List<Double>> generateEmbeddings(List<String> inputs) {
        if (wikiProperties.hasEmbeddingModelId()) {
            return modelConfigService.generateEmbeddings(wikiProperties.getEmbeddingModelId(), inputs);
        }
        return modelConfigService.generateEmbeddings(resolveFixedEmbeddingConfig(), inputs);
    }

    private ModelConfigService.ResolvedModelConfig resolveFixedEmbeddingConfig() {
        return new ModelConfigService.ResolvedModelConfig(
                null, "平台工具向量模型", ModelConfigService.MODEL_TYPE_EMBEDDING,
                wikiProperties.getEmbeddingProvider(),
                wikiProperties.getEmbeddingBaseUrl(),
                wikiProperties.getEmbeddingModelName(),
                ModelConfigService.OPENAI_API_MODE_AUTO,
                wikiProperties.getEmbeddingApiKey());
    }

    /** 仅用于测试：暴露已索引工具的 toolCode 集合，校验索引覆盖范围。 */
    Set<String> indexedToolCodes() {
        return KEYWORDS.keySet();
    }
}
