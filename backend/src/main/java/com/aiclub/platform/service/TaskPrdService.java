package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskPrdProjectionEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.TaskPrdAnalyzeResult;
import com.aiclub.platform.dto.TaskPrdDetail;
import com.aiclub.platform.dto.TaskPrdRecallReference;
import com.aiclub.platform.dto.WikiSpacePageSummary;
import com.aiclub.platform.dto.WikiSpaceSearchResult;
import com.aiclub.platform.dto.request.ApplyTaskPrdSuggestionRequest;
import com.aiclub.platform.dto.request.TaskPrdAnalyzeRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.TaskPrdProjectionRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.repository.WikiSpaceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 需求工作项 PRD 服务。
 * 该服务负责 PRD 自动初始化、AI 分析和确认写回，不改变工作项主事实源地位。
 */
@Service
@Transactional(readOnly = true)
public class TaskPrdService {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_READY = "READY";
    public static final String STATUS_FAILED = "FAILED";
    public static final String ACTION_GAP_CHECK = "GAP_CHECK";
    public static final String ACTION_SUGGEST_UPDATE = "SUGGEST_UPDATE";
    public static final String DEFAULT_MODULE_NAME = "未分类";

    private static final String ROOT_DIRECTORY_NAME = "需求PRD";
    private static final String AI_CHANGE_SUMMARY = "应用 AI PRD 建议";
    private static final String SUGGESTION_READY_SUMMARY = "## 建议说明\n\n- 已生成一版可确认的 PRD 建议稿，请确认后写入正式页面。";
    private static final int RECALL_LIMIT = 5;
    private static final int MAX_PRD_CONTENT_LENGTH = 12000;
    private static final int MAX_TASK_CONTEXT_LENGTH = 8000;
    private static final Pattern THINK_BLOCK_PATTERN = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern JSON_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```json\\s*(\\{.*})\\s*```");
    private static final Pattern GENERIC_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```(?:markdown|md)?\\s*(.*?)\\s*```");
    private static final Pattern LEVEL_TWO_HEADING_PATTERN = Pattern.compile("(?m)^##\\s+(.+?)\\s*$");
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TaskRepository taskRepository;
    private final TaskPrdProjectionRepository taskPrdProjectionRepository;
    private final WikiSpaceRepository wikiSpaceRepository;
    private final WikiPageV2Repository wikiPageV2Repository;
    private final WikiSpaceService wikiSpaceService;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final ModelConfigService modelConfigService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ObjectMapper objectMapper;

    public TaskPrdService(TaskRepository taskRepository,
                          TaskPrdProjectionRepository taskPrdProjectionRepository,
                          WikiSpaceRepository wikiSpaceRepository,
                          WikiPageV2Repository wikiPageV2Repository,
                          WikiSpaceService wikiSpaceService,
                          AiModelConfigRepository aiModelConfigRepository,
                          ModelConfigService modelConfigService,
                          ProjectDataPermissionService projectDataPermissionService,
                          ObjectMapper objectMapper) {
        this.taskRepository = taskRepository;
        this.taskPrdProjectionRepository = taskPrdProjectionRepository;
        this.wikiSpaceRepository = wikiSpaceRepository;
        this.wikiPageV2Repository = wikiPageV2Repository;
        this.wikiSpaceService = wikiSpaceService;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.modelConfigService = modelConfigService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.objectMapper = objectMapper;
    }

    /**
     * 读取需求工作项当前 PRD 投影详情。
     */
    public TaskPrdDetail getTaskPrd(Long taskId) {
        TaskEntity task = requireRequirementTask(taskId);
        return toDetail(task, taskPrdProjectionRepository.findByTask_Id(taskId).orElse(null));
    }

    /**
     * 在工作项创建后自动初始化 PRD。
     * 初始化失败不会向上抛错，避免阻塞工作项主流程。
     */
    @Transactional
    public void initializeIfEligible(Long taskId) {
        Optional<TaskEntity> optionalTask = taskRepository.findById(taskId);
        if (optionalTask.isEmpty()) {
            return;
        }
        TaskEntity task = optionalTask.get();
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireTaskVisible(task);
        }
        if (!"需求".equals(defaultString(task.getWorkItemType()).trim())) {
            return;
        }
        initializeProjection(task);
    }

    /**
     * 手动初始化或重试初始化 PRD 页面。
     */
    @Transactional
    public TaskPrdDetail initialize(Long taskId) {
        TaskEntity task = requireRequirementTask(taskId);
        TaskPrdProjectionEntity projection = initializeProjection(task);
        return toDetail(task, projection);
    }

    /**
     * 生成 PRD 缺口分析或建议更新结果。
     */
    @Transactional
    public TaskPrdAnalyzeResult analyze(Long taskId, TaskPrdAnalyzeRequest request) {
        TaskEntity task = requireRequirementTask(taskId);
        TaskPrdProjectionEntity projection = requireReadyProjection(task);
        WikiPageV2Entity page = requireProjectionPage(projection);
        AiModelConfigEntity modelConfig = resolveModelConfig(request.modelConfigId());
        String action = normalizeAction(request.action());
        List<TaskPrdRecallReference> references = resolveRecallReferences(task, page);
        String userPrompt = buildAnalyzePrompt(task, page, references);

        TaskPrdAnalyzeResult result = switch (action) {
            case ACTION_GAP_CHECK -> buildGapCheckResult(task, modelConfig, userPrompt, references);
            case ACTION_SUGGEST_UPDATE -> buildSuggestUpdateResult(task, modelConfig, userPrompt, references);
            default -> throw new IllegalArgumentException("不支持的 PRD 分析动作");
        };

        projection.setLastAiSuggestedAt(LocalDateTime.now());
        projection.setStatus(STATUS_READY);
        projection.setLastError("");
        taskPrdProjectionRepository.save(projection);
        return result;
    }

    /**
     * 将确认后的 AI 建议稿写回 PRD 页面。
     */
    @Transactional
    public TaskPrdDetail applySuggestion(Long taskId, ApplyTaskPrdSuggestionRequest request) {
        TaskEntity task = requireRequirementTask(taskId);
        TaskPrdProjectionEntity projection = requireReadyProjection(task);
        WikiPageV2Entity page = requireProjectionPage(projection);
        String suggestionMarkdown = normalizeDocument(request.suggestionMarkdown());
        if (suggestionMarkdown.isBlank()) {
            throw new IllegalArgumentException("建议稿内容不能为空");
        }
        WikiPageV2Entity saved = wikiSpaceService.updateAutomationPageContent(
                projection.getWikiSpace().getId(),
                page.getId(),
                suggestionMarkdown,
                hasText(request.changeSummary()) ? request.changeSummary().trim() : AI_CHANGE_SUMMARY
        );
        projection.setPrdWikiPage(saved);
        projection.setPrdWikiDirectory(saved.getDirectory());
        projection.setStatus(STATUS_READY);
        projection.setLastError("");
        projection.setLastUserConfirmedAt(LocalDateTime.now());
        taskPrdProjectionRepository.save(projection);
        return toDetail(task, projection);
    }

    private TaskPrdProjectionEntity initializeProjection(TaskEntity task) {
        TaskPrdProjectionEntity projection = taskPrdProjectionRepository.findByTask_Id(task.getId())
                .orElseGet(() -> createProjection(task));
        projection.setProject(task.getProject());

        try {
            WikiPageV2Entity existingPage = findExistingProjectionPage(projection);
            if (existingPage != null) {
                projection.setWikiSpace(existingPage.getSpace());
                projection.setPrdWikiDirectory(existingPage.getDirectory());
                projection.setPrdWikiPage(existingPage);
                projection.setStatus(STATUS_READY);
                projection.setLastError("");
                return taskPrdProjectionRepository.save(projection);
            }

            List<WikiSpaceEntity> boundSpaces = wikiSpaceRepository.findAllByBoundProject_IdOrderByIdAsc(task.getProject().getId());
            if (boundSpaces.isEmpty()) {
                return markFailed(projection, "当前项目未绑定唯一 Wiki 空间，暂时无法自动初始化 PRD");
            }
            if (boundSpaces.size() > 1) {
                return markFailed(projection, "当前项目绑定了多个 Wiki 空间，请先收敛为唯一空间后重试");
            }

            WikiSpaceEntity wikiSpace = boundSpaces.get(0);
            String moduleName = normalizeModuleName(task.getModuleName());
            WikiDirectoryEntity rootDirectory = wikiSpaceService.ensureAutomationDirectory(
                    wikiSpace.getId(),
                    null,
                    ROOT_DIRECTORY_NAME,
                    task.getProject().getId()
            );
            WikiDirectoryEntity moduleDirectory = wikiSpaceService.ensureAutomationDirectory(
                    wikiSpace.getId(),
                    rootDirectory.getId(),
                    moduleName,
                    task.getProject().getId()
            );
            String pageTitle = buildPrdPageTitle(task);
            WikiPageV2Entity page = wikiPageV2Repository.findBySpace_IdAndDirectory_IdAndTitleIgnoreCase(
                    wikiSpace.getId(),
                    moduleDirectory.getId(),
                    pageTitle
            ).orElseGet(() -> wikiSpaceService.createAutomationPage(
                    wikiSpace.getId(),
                    moduleDirectory.getId(),
                    pageTitle,
                    buildInitialPrdMarkdown(task, moduleName, LocalDateTime.now())
            ));

            projection.setWikiSpace(wikiSpace);
            projection.setPrdWikiDirectory(moduleDirectory);
            projection.setPrdWikiPage(page);
            projection.setStatus(STATUS_READY);
            projection.setLastError("");
            if (projection.getLastGeneratedAt() == null) {
                projection.setLastGeneratedAt(LocalDateTime.now());
            }
            return taskPrdProjectionRepository.save(projection);
        } catch (RuntimeException exception) {
            return markFailed(projection, limitMessage(exception.getMessage()));
        }
    }

    private TaskPrdAnalyzeResult buildGapCheckResult(TaskEntity task,
                                                     AiModelConfigEntity modelConfig,
                                                     String userPrompt,
                                                     List<TaskPrdRecallReference> references) {
        String raw = invokePrompt(modelConfig, gapCheckPrompt(), userPrompt, 2600);
        GapCheckParseResult parsed = parseGapCheckResult(raw);
        return new TaskPrdAnalyzeResult(
                ACTION_GAP_CHECK,
                "PRD 缺口检查",
                parsed.markdown(),
                "",
                modelConfig.getId(),
                modelConfig.getName(),
                parsed.gaps(),
                parsed.questions(),
                references
        );
    }

    private TaskPrdAnalyzeResult buildSuggestUpdateResult(TaskEntity task,
                                                          AiModelConfigEntity modelConfig,
                                                          String userPrompt,
                                                          List<TaskPrdRecallReference> references) {
        String raw = invokePrompt(modelConfig, suggestUpdatePrompt(), userPrompt, 4200);
        SuggestUpdateParseResult parsed = parseSuggestUpdateResult(raw);
        return new TaskPrdAnalyzeResult(
                ACTION_SUGGEST_UPDATE,
                "PRD 建议更新",
                parsed.markdown(),
                parsed.suggestionMarkdown(),
                modelConfig.getId(),
                modelConfig.getName(),
                parsed.gaps(),
                parsed.questions(),
                references
        );
    }

    private GapCheckParseResult parseGapCheckResult(String raw) {
        String markdown = cleanMarkdownOutput(raw);
        List<String> gaps = List.of();
        List<String> questions = List.of();
        try {
            JsonNode root = objectMapper.readTree(extractJsonObject(raw));
            markdown = hasText(root.path("markdown").asText()) ? root.path("markdown").asText().trim() : markdown;
            gaps = parseStringList(root.path("gaps"));
            questions = parseStringList(root.path("questions"));
        } catch (Exception ignored) {
        }
        return new GapCheckParseResult(markdown, gaps, questions);
    }

    private SuggestUpdateParseResult parseSuggestUpdateResult(String raw) {
        String markdown = cleanMarkdownOutput(raw);
        String suggestionMarkdown = "";
        List<String> gaps = List.of();
        List<String> questions = List.of();
        try {
            JsonNode root = objectMapper.readTree(extractJsonObject(raw));
            if (hasText(root.path("markdown").asText())) {
                markdown = root.path("markdown").asText().trim();
            }
            if (hasText(root.path("suggestionMarkdown").asText())) {
                suggestionMarkdown = root.path("suggestionMarkdown").asText().trim();
            } else if (hasText(root.path("prdMarkdown").asText())) {
                suggestionMarkdown = root.path("prdMarkdown").asText().trim();
            }
            gaps = parseStringList(root.path("gaps"));
            questions = parseStringList(root.path("questions"));
        } catch (Exception ignored) {
        }

        if (!hasText(suggestionMarkdown) && looksLikePrdMarkdown(markdown)) {
            suggestionMarkdown = markdown;
            markdown = SUGGESTION_READY_SUMMARY;
        }
        if (!hasText(markdown) && hasText(suggestionMarkdown)) {
            markdown = SUGGESTION_READY_SUMMARY;
        }
        return new SuggestUpdateParseResult(markdown, suggestionMarkdown, gaps, questions);
    }

    private List<TaskPrdRecallReference> resolveRecallReferences(TaskEntity task, WikiPageV2Entity page) {
        String moduleName = normalizeModuleName(task.getModuleName());
        String query = buildRecallQuery(task, page);
        List<WikiSpaceSearchResult> results;
        try {
            results = wikiSpaceService.semanticSearchPages(query, page.getSpace().getId(), task.getProject().getId());
        } catch (RuntimeException exception) {
            results = wikiSpaceService.searchPages(query, page.getSpace().getId(), task.getProject().getId()).stream()
                    .map(item -> new WikiSpaceSearchResult(item, null, "关键词匹配结果"))
                    .toList();
        }

        return results.stream()
                .filter(item -> item.page() != null)
                .filter(item -> !Objects.equals(item.page().id(), page.getId()))
                .sorted(Comparator
                        .comparing((WikiSpaceSearchResult item) -> Objects.equals(defaultString(item.page().directoryName()), moduleName) ? 0 : 1)
                        .thenComparing((WikiSpaceSearchResult item) -> item.score() == null ? Double.NEGATIVE_INFINITY : item.score(), Comparator.reverseOrder())
                        .thenComparing(item -> defaultString(item.page().updatedAt()), Comparator.reverseOrder()))
                .limit(RECALL_LIMIT)
                .map(item -> new TaskPrdRecallReference(
                        item.page().spaceId(),
                        item.page().id(),
                        item.page().title(),
                        item.page().directoryName(),
                        abbreviate(defaultString(item.snippet()), 240),
                        item.score()
                ))
                .toList();
    }

    private String buildAnalyzePrompt(TaskEntity task, WikiPageV2Entity page, List<TaskPrdRecallReference> references) {
        StringBuilder builder = new StringBuilder();
        builder.append("需求工作项上下文：\n");
        builder.append(buildTaskContext(task)).append("\n\n");
        builder.append("当前 PRD：\n");
        builder.append(abbreviate(defaultString(page.getContent()), MAX_PRD_CONTENT_LENGTH)).append("\n\n");
        builder.append("召回参考：\n");
        if (references.isEmpty()) {
            builder.append("暂无相关参考。\n");
        } else {
            int index = 1;
            for (TaskPrdRecallReference reference : references) {
                builder.append(index++)
                        .append(". 标题：").append(reference.title()).append('\n')
                        .append("   目录：").append(reference.directoryName()).append('\n')
                        .append("   摘要：").append(defaultString(reference.snippet())).append('\n');
            }
        }
        return abbreviate(builder.toString().trim(), MAX_TASK_CONTEXT_LENGTH);
    }

    private String gapCheckPrompt() {
        return """
                你是资深产品经理，请检查当前需求 PRD 是否存在明显缺口。
                严格要求：
                1. 只输出 JSON 对象，不要输出思考过程，不要输出 <think> 标签。
                2. 不要使用 Markdown 代码块包裹 JSON。
                3. JSON 格式固定如下：
                {
                  "markdown": "## 缺口分析\\n- ...\\n\\n## 待确认问题\\n- ...",
                  "gaps": ["缺口1", "缺口2"],
                  "questions": ["问题1", "问题2"]
                }
                4. gaps 最多 6 条，questions 最多 6 条。
                5. 如果信息已足够，也要明确说明当前 PRD 已较完整。
                """;
    }

    private String suggestUpdatePrompt() {
        return """
                你是资深产品经理，请基于当前需求和参考内容输出一版可确认写回的完整 PRD 建议稿。
                严格要求：
                1. 只输出 JSON 对象，不要输出思考过程，不要输出 <think> 标签。
                2. 不要使用 Markdown 代码块包裹 JSON。
                3. JSON 格式固定如下：
                {
                  "markdown": "## 建议说明\\n- ...",
                  "suggestionMarkdown": "## 背景\\n...\\n\\n## 目标\\n...\\n\\n## 用户故事\\n...\\n\\n## 需求描述\\n...\\n\\n## 范围与边界\\n...\\n\\n## 验收标准\\n...\\n\\n## 待确认问题\\n...",
                  "gaps": ["仍待确认的缺口"],
                  "questions": ["仍待用户确认的问题"]
                }
                4. suggestionMarkdown 必须是完整的 Markdown 文档，且只包含：背景、目标、用户故事、需求描述、范围与边界、验收标准、待确认问题 七个二级标题。
                5. 每个章节都必须有内容，缺失信息请标记“待完善”。
                """;
    }

    private TaskEntity requireRequirementTask(Long taskId) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + taskId));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireTaskVisible(task);
        }
        if (!"需求".equals(defaultString(task.getWorkItemType()).trim())) {
            throw new IllegalArgumentException("仅需求类型工作项支持 PRD 能力");
        }
        return task;
    }

    private TaskPrdProjectionEntity requireReadyProjection(TaskEntity task) {
        TaskPrdProjectionEntity projection = taskPrdProjectionRepository.findByTask_Id(task.getId())
                .orElseThrow(() -> new IllegalArgumentException("当前工作项尚未初始化 PRD"));
        if (!STATUS_READY.equalsIgnoreCase(defaultString(projection.getStatus()))) {
            throw new IllegalArgumentException(resolveStatusMessage(projection, null));
        }
        requireProjectionPage(projection);
        return projection;
    }

    private WikiPageV2Entity requireProjectionPage(TaskPrdProjectionEntity projection) {
        Long spaceId = projection.getWikiSpace() == null ? null : projection.getWikiSpace().getId();
        Long pageId = projection.getPrdWikiPage() == null ? null : projection.getPrdWikiPage().getId();
        if (spaceId == null || pageId == null) {
            throw new IllegalArgumentException("当前工作项尚未初始化 PRD");
        }
        return wikiPageV2Repository.findDetailBySpace_IdAndId(spaceId, pageId)
                .or(() -> wikiPageV2Repository.findBySpace_IdAndId(spaceId, pageId))
                .orElseThrow(() -> new IllegalArgumentException("当前工作项关联的 PRD 页面不存在，请先重试初始化"));
    }

    private TaskPrdProjectionEntity createProjection(TaskEntity task) {
        TaskPrdProjectionEntity entity = new TaskPrdProjectionEntity();
        entity.setTask(task);
        entity.setProject(task.getProject());
        entity.setStatus(STATUS_PENDING);
        entity.setLastError("");
        return entity;
    }

    private WikiPageV2Entity findExistingProjectionPage(TaskPrdProjectionEntity projection) {
        Long spaceId = projection.getWikiSpace() == null ? null : projection.getWikiSpace().getId();
        Long pageId = projection.getPrdWikiPage() == null ? null : projection.getPrdWikiPage().getId();
        if (spaceId == null || pageId == null) {
            return null;
        }
        return wikiPageV2Repository.findBySpace_IdAndId(spaceId, pageId).orElse(null);
    }

    private TaskPrdProjectionEntity markFailed(TaskPrdProjectionEntity projection, String message) {
        projection.setStatus(STATUS_FAILED);
        projection.setLastError(limitMessage(message));
        if (projection.getWikiSpace() == null) {
            projection.setPrdWikiDirectory(null);
            projection.setPrdWikiPage(null);
        }
        return taskPrdProjectionRepository.save(projection);
    }

    private TaskPrdDetail toDetail(TaskEntity task, TaskPrdProjectionEntity projection) {
        if (projection == null) {
            return new TaskPrdDetail(
                    task.getId(),
                    normalizeModuleName(task.getModuleName()),
                    null,
                    "尚未初始化 PRD",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
            );
        }

        WikiPageV2Entity page = findExistingProjectionPage(projection);
        WikiDirectoryEntity directory = page != null
                ? page.getDirectory()
                : projection.getPrdWikiDirectory();
        return new TaskPrdDetail(
                task.getId(),
                normalizeModuleName(task.getModuleName()),
                projection.getStatus(),
                resolveStatusMessage(projection, page),
                projection.getWikiSpace() == null ? null : projection.getWikiSpace().getId(),
                projection.getWikiSpace() == null ? null : projection.getWikiSpace().getName(),
                directory == null ? null : directory.getId(),
                directory == null ? null : directory.getName(),
                page == null ? null : page.getId(),
                page == null ? null : page.getTitle(),
                page == null ? null : page.getContent(),
                page == null ? null : formatTime(page.getUpdatedAt()),
                formatTime(projection.getLastGeneratedAt()),
                formatTime(projection.getLastAiSuggestedAt()),
                formatTime(projection.getLastUserConfirmedAt())
        );
    }

    private String resolveStatusMessage(TaskPrdProjectionEntity projection, WikiPageV2Entity page) {
        String status = defaultString(projection.getStatus()).toUpperCase(Locale.ROOT);
        return switch (status) {
            case STATUS_READY -> page == null ? "当前工作项关联的 PRD 页面不存在，请先重试初始化" : "";
            case STATUS_PENDING -> "PRD 初始化中";
            case STATUS_FAILED -> hasText(projection.getLastError()) ? projection.getLastError() : "PRD 初始化失败";
            default -> hasText(projection.getLastError()) ? projection.getLastError() : "尚未初始化 PRD";
        };
    }

    private String buildPrdPageTitle(TaskEntity task) {
        return "%s-%s".formatted(defaultString(task.getWorkItemCode()).trim(), defaultString(task.getName()).trim()).trim();
    }

    private String buildInitialPrdMarkdown(TaskEntity task, String moduleName, LocalDateTime generatedAt) {
        Map<String, String> sections = extractRequirementSections(firstNonBlank(task.getRequirementMarkdown(), task.getDescription()));
        String requirementDescription = withFallback(appendPrototypeUrl(sections.get("需求描述"), task.getPrototypeUrl()));
        return """
                <!-- taskId=%s workItemCode=%s projectId=%s moduleName=%s generatedAt=%s -->
                ## 背景

                %s

                ## 目标

                %s

                ## 用户故事

                %s

                ## 需求描述

                %s

                ## 范围与边界

                %s

                ## 验收标准

                %s

                ## 待确认问题

                待完善
                """.formatted(
                task.getId(),
                defaultString(task.getWorkItemCode()).trim(),
                task.getProject().getId(),
                moduleName,
                formatTime(generatedAt),
                withFallback("该 PRD 来源于工作项“%s”，当前归档模块为“%s”。".formatted(defaultString(task.getName()).trim(), moduleName)),
                withFallback("围绕工作项“%s”形成一版可持续维护的需求说明。".formatted(defaultString(task.getName()).trim())),
                withFallback(sections.get("用户故事")),
                requirementDescription,
                withFallback("待完善"),
                withFallback(sections.get("验收标准"))
        ).trim();
    }

    private String appendPrototypeUrl(String content, String prototypeUrl) {
        String normalizedContent = normalizeDocument(content);
        if (!hasText(prototypeUrl)) {
            return normalizedContent;
        }
        if (!hasText(normalizedContent)) {
            return "原型链接：%s".formatted(prototypeUrl.trim());
        }
        return normalizedContent + "\n\n原型链接：%s".formatted(prototypeUrl.trim());
    }

    private Map<String, String> extractRequirementSections(String markdown) {
        String normalized = normalizeDocument(markdown);
        List<SectionMatch> matches = new ArrayList<>();
        Matcher matcher = LEVEL_TWO_HEADING_PATTERN.matcher(normalized);
        while (matcher.find()) {
            matches.add(new SectionMatch(matcher.group(1).trim(), matcher.start(), matcher.end()));
        }
        LinkedHashMap<String, String> sections = new LinkedHashMap<>();
        for (int index = 0; index < matches.size(); index++) {
            SectionMatch current = matches.get(index);
            int end = index + 1 < matches.size() ? matches.get(index + 1).start() : normalized.length();
            sections.put(current.title(), normalized.substring(current.end(), end).trim());
        }
        return sections;
    }

    private String buildRecallQuery(TaskEntity task, WikiPageV2Entity page) {
        return abbreviate(
                """
                        标题：%s
                        模块：%s
                        项目：%s
                        需求摘要：
                        %s

                        当前 PRD 摘要：
                        %s
                        """.formatted(
                        task.getName(),
                        normalizeModuleName(task.getModuleName()),
                        task.getProject().getName(),
                        firstNonBlank(task.getRequirementMarkdown(), task.getDescription()),
                        page.getContent()
                ).trim(),
                4000
        );
    }

    private String buildTaskContext(TaskEntity task) {
        return abbreviate(
                """
                        需求标题：%s
                        工作项编号：%s
                        项目：%s
                        所属迭代：%s
                        当前状态：%s
                        优先级：%s
                        所属模块：%s
                        原型链接：%s
                        当前需求内容：
                        %s
                        """.formatted(
                        task.getName(),
                        defaultString(task.getWorkItemCode()),
                        task.getProject().getName(),
                        task.getIteration() == null ? "未规划" : task.getIteration().getName(),
                        defaultString(task.getStatus()),
                        defaultString(task.getPriority()),
                        normalizeModuleName(task.getModuleName()),
                        defaultString(task.getPrototypeUrl()),
                        firstNonBlank(task.getRequirementMarkdown(), task.getDescription())
                ).trim(),
                MAX_TASK_CONTEXT_LENGTH
        );
    }

    private AiModelConfigEntity resolveModelConfig(Long modelConfigId) {
        if (modelConfigId != null) {
            AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(modelConfigId)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId));
            if (!Boolean.TRUE.equals(modelConfig.getEnabled())) {
                throw new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId);
            }
            if (!isChatModelConfig(modelConfig)) {
                throw new IllegalArgumentException("PRD AI 仅支持对话模型配置");
            }
            return modelConfig;
        }
        return aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT).stream()
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("没有可用的已启用对话模型配置"));
    }

    private String normalizeAction(String action) {
        String value = defaultString(action).trim().toUpperCase(Locale.ROOT);
        if (!ACTION_GAP_CHECK.equals(value) && !ACTION_SUGGEST_UPDATE.equals(value)) {
            throw new IllegalArgumentException("不支持的 PRD 分析动作");
        }
        return value;
    }

    private String invokePrompt(AiModelConfigEntity modelConfig, String systemPrompt, String userPrompt, int maxTokens) {
        return modelConfigService.invokePrompt(
                modelConfigService.resolveModelConfig(modelConfig.getId()),
                systemPrompt,
                userPrompt,
                maxTokens
        );
    }

    private boolean isChatModelConfig(AiModelConfigEntity modelConfig) {
        return ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()));
    }

    private List<String> parseStringList(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            String text = normalizeDocument(item.asText());
            if (hasText(text)) {
                values.add(text);
            }
        }
        return values;
    }

    private String cleanMarkdownOutput(String raw) {
        String cleaned = stripThinkingContent(raw);
        cleaned = stripMarkdownCodeFence(cleaned);
        try {
            JsonNode root = objectMapper.readTree(cleaned);
            if (root.hasNonNull("markdown") && hasText(root.path("markdown").asText())) {
                return root.path("markdown").asText().trim();
            }
            if (root.hasNonNull("suggestionMarkdown") && hasText(root.path("suggestionMarkdown").asText())) {
                return root.path("suggestionMarkdown").asText().trim();
            }
        } catch (Exception ignored) {
        }
        return defaultString(cleaned).trim();
    }

    private String extractJsonObject(String raw) {
        String cleaned = stripThinkingContent(raw);
        Matcher jsonCodeBlockMatcher = JSON_CODE_BLOCK_PATTERN.matcher(cleaned);
        if (jsonCodeBlockMatcher.find()) {
            return jsonCodeBlockMatcher.group(1).trim();
        }
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1).trim();
        }
        return cleaned.trim();
    }

    private String stripThinkingContent(String raw) {
        return THINK_BLOCK_PATTERN.matcher(defaultString(raw)).replaceAll("").trim();
    }

    private String stripMarkdownCodeFence(String raw) {
        String cleaned = defaultString(raw).trim();
        Matcher genericCodeBlockMatcher = GENERIC_CODE_BLOCK_PATTERN.matcher(cleaned);
        if (genericCodeBlockMatcher.matches()) {
            return defaultString(genericCodeBlockMatcher.group(1)).trim();
        }
        return cleaned;
    }

    private boolean looksLikePrdMarkdown(String markdown) {
        String normalized = normalizeDocument(markdown);
        return normalized.contains("## 背景")
                && normalized.contains("## 目标")
                && normalized.contains("## 用户故事")
                && normalized.contains("## 需求描述")
                && normalized.contains("## 范围与边界")
                && normalized.contains("## 验收标准")
                && normalized.contains("## 待确认问题");
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String normalizeModuleName(String moduleName) {
        String normalized = defaultString(moduleName).trim();
        return normalized.isBlank() ? DEFAULT_MODULE_NAME : normalized;
    }

    private String withFallback(String value) {
        String normalized = normalizeDocument(value);
        return normalized.isBlank() ? "待完善" : normalized;
    }

    private String normalizeDocument(String value) {
        return defaultString(value).replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private String firstNonBlank(String first, String second) {
        return hasText(first) ? first.trim() : defaultString(second).trim();
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value).trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(maxLength - 3, 0)).trim() + "...";
    }

    private String limitMessage(String value) {
        return abbreviate(value, 1000);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private record GapCheckParseResult(
            String markdown,
            List<String> gaps,
            List<String> questions
    ) {
    }

    private record SuggestUpdateParseResult(
            String markdown,
            String suggestionMarkdown,
            List<String> gaps,
            List<String> questions
    ) {
    }

    private record SectionMatch(
            String title,
            int start,
            int end
    ) {
    }
}
