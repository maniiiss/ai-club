package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.dto.TaskRequirementAiSuggestion;
import com.aiclub.platform.dto.TaskRequirementAiTestCaseStepSuggestion;
import com.aiclub.platform.dto.TaskRequirementAiTestCaseSuggestion;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Transactional(readOnly = true)
public class TaskRequirementAiService {

    private static final String ACTION_STANDARDIZE = "STANDARDIZE";
    private static final String ACTION_BREAKDOWN = "BREAKDOWN";
    private static final String ACTION_TEST_CASES = "TEST_CASES";

    private static final Pattern THINK_BLOCK_PATTERN = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern JSON_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```json\\s*(\\{.*})\\s*```");
    private static final Pattern GENERIC_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```(?:markdown|md)?\\s*(.*?)\\s*```");
    private static final Pattern ORDERED_LIST_PATTERN = Pattern.compile("^\\d+\\.\\s+(.+)$");
    private static final Pattern UNORDERED_LIST_PATTERN = Pattern.compile("^[-*]\\s+(.+)$");

    private final TaskRepository taskRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final ModelConfigService modelConfigService;
    private final ObjectMapper objectMapper;
    private final ProjectDataPermissionService projectDataPermissionService;

    public TaskRequirementAiService(TaskRepository taskRepository,
                                    AiModelConfigRepository aiModelConfigRepository,
                                    ModelConfigService modelConfigService,
                                    ObjectMapper objectMapper,
                                    ProjectDataPermissionService projectDataPermissionService) {
        this.taskRepository = taskRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.modelConfigService = modelConfigService;
        this.objectMapper = objectMapper;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    public TaskRequirementAiResult generate(Long taskId, TaskRequirementAiRequest request) {
        TaskEntity task = requireRequirementTask(taskId);
        AiModelConfigEntity modelConfig = resolveModelConfig(request.modelConfigId());
        String action = normalizeAction(request.action());

        return switch (action) {
            case ACTION_STANDARDIZE -> buildMarkdownResult(
                    ACTION_STANDARDIZE,
                    "标准化需求",
                    task,
                    modelConfig,
                    standardizePrompt(),
                    buildTaskContext(task),
                    2200
            );
            case ACTION_BREAKDOWN -> buildBreakdownResult(task, modelConfig);
            case ACTION_TEST_CASES -> buildTestCasesResult(task, modelConfig);
            default -> throw new IllegalArgumentException("不支持的 AI 动作");
        };
    }

    private TaskRequirementAiResult buildMarkdownResult(String action,
                                                        String title,
                                                        TaskEntity task,
                                                        AiModelConfigEntity modelConfig,
                                                        String systemPrompt,
                                                        String userPrompt,
                                                        int maxTokens) {
        String raw = invokePrompt(modelConfig, systemPrompt, userPrompt, maxTokens);
        return new TaskRequirementAiResult(
                action,
                title,
                cleanMarkdownOutput(raw),
                modelConfig.getId(),
                modelConfig.getName(),
                List.of(),
                List.of()
        );
    }

    private TaskRequirementAiResult buildBreakdownResult(TaskEntity task, AiModelConfigEntity modelConfig) {
        String raw = invokePrompt(modelConfig, breakdownPrompt(), buildTaskContext(task), 2600);
        String markdown = cleanMarkdownOutput(raw);
        List<TaskRequirementAiSuggestion> taskSuggestions = List.of();

        try {
            JsonNode root = objectMapper.readTree(extractJsonObject(raw));
            if (hasText(root.path("markdown").asText())) {
                markdown = root.path("markdown").asText().trim();
            }

            List<TaskRequirementAiSuggestion> parsed = new ArrayList<>();
            for (JsonNode node : root.path("tasks")) {
                String name = trimToNull(node.path("name").asText());
                if (name == null) {
                    continue;
                }
                parsed.add(new TaskRequirementAiSuggestion(
                        name,
                        normalizeTaskCategory(node.path("category").asText()),
                        normalizeTaskPriority(node.path("priority").asText()),
                        defaultString(node.path("description").asText())
                ));
            }
            taskSuggestions = parsed;
        } catch (Exception ignored) {
        }

        return new TaskRequirementAiResult(
                ACTION_BREAKDOWN,
                "拆解子任务",
                markdown,
                modelConfig.getId(),
                modelConfig.getName(),
                taskSuggestions,
                List.of()
        );
    }

    private TaskRequirementAiResult buildTestCasesResult(TaskEntity task, AiModelConfigEntity modelConfig) {
        String markdown = "";
        List<TaskRequirementAiTestCaseSuggestion> testCaseSuggestions = List.of();
        RuntimeException primaryFailure = null;

        try {
            String raw = invokePrompt(modelConfig, testCasesPrompt(), buildTaskContext(task), 1800);
            TestCaseParseResult parsed = parseTestCaseResult(raw);
            markdown = parsed.markdown();
            testCaseSuggestions = parsed.suggestions();
            if (!hasText(markdown) && testCaseSuggestions.isEmpty()) {
                throw new IllegalStateException("测试用例结果为空");
            }
        } catch (RuntimeException ex) {
            primaryFailure = ex;
        }

        if (!hasText(markdown) && testCaseSuggestions.isEmpty()) {
            String fallbackRaw = invokePrompt(modelConfig, testCasesFallbackPrompt(), buildTaskContext(task), 1200);
            TestCaseParseResult fallbackParsed = parseTestCaseResult(fallbackRaw);
            markdown = fallbackParsed.markdown();
            testCaseSuggestions = fallbackParsed.suggestions();
        }

        if (!hasText(markdown) && testCaseSuggestions.isEmpty() && primaryFailure != null) {
            throw primaryFailure;
        }

        return new TaskRequirementAiResult(
                ACTION_TEST_CASES,
                "测试用例",
                markdown,
                modelConfig.getId(),
                modelConfig.getName(),
                List.of(),
                testCaseSuggestions
        );
    }

    private TestCaseParseResult parseTestCaseResult(String raw) {
        String markdown = cleanMarkdownOutput(raw);
        List<TaskRequirementAiTestCaseSuggestion> suggestions = List.of();

        try {
            JsonNode root = objectMapper.readTree(extractJsonObject(raw));
            if (hasText(root.path("markdown").asText())) {
                markdown = root.path("markdown").asText().trim();
            }
            List<TaskRequirementAiTestCaseSuggestion> parsed = parseTestCasesFromJson(root.path("testCases"));
            if (!parsed.isEmpty()) {
                suggestions = parsed;
            }
        } catch (Exception ignored) {
        }

        if (suggestions.isEmpty()) {
            suggestions = deriveTestCasesFromMarkdown(markdown);
        }

        return new TestCaseParseResult(markdown, suggestions);
    }

    private List<TaskRequirementAiTestCaseSuggestion> parseTestCasesFromJson(JsonNode node) {
        List<TaskRequirementAiTestCaseSuggestion> parsed = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return parsed;
        }

        for (JsonNode item : node) {
            String title = trimToNull(item.path("title").asText());
            if (title == null) {
                continue;
            }

            List<TaskRequirementAiTestCaseStepSuggestion> steps = new ArrayList<>();
            for (JsonNode stepNode : item.path("steps")) {
                String action = trimToNull(stepNode.path("action").asText());
                String expectedResult = trimToNull(stepNode.path("expectedResult").asText());
                if (action == null || expectedResult == null) {
                    continue;
                }
                int stepNo = stepNode.path("stepNo").isInt() ? stepNode.path("stepNo").asInt() : steps.size() + 1;
                steps.add(new TaskRequirementAiTestCaseStepSuggestion(stepNo, action, expectedResult));
            }

            if (steps.isEmpty()) {
                steps.add(new TaskRequirementAiTestCaseStepSuggestion(1, "执行“" + title + "”场景", "场景执行结果符合需求预期"));
            }

            parsed.add(new TaskRequirementAiTestCaseSuggestion(
                    title,
                    defaultString(item.path("moduleName").asText()),
                    normalizeCaseType(item.path("caseType").asText()),
                    normalizeCasePriority(item.path("priority").asText()),
                    defaultString(item.path("precondition").asText()),
                    defaultString(item.path("remarks").asText()),
                    steps
            ));
        }

        return parsed;
    }

    private List<TaskRequirementAiTestCaseSuggestion> deriveTestCasesFromMarkdown(String markdown) {
        List<TaskRequirementAiTestCaseSuggestion> derived = new ArrayList<>();
        String currentSection = "功能测试";

        for (String rawLine : defaultString(markdown).replace("\r\n", "\n").split("\n")) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }

            if (line.startsWith("###")) {
                currentSection = line.substring(3).trim();
                continue;
            }
            if (line.startsWith("##")) {
                continue;
            }

            Matcher orderedMatcher = ORDERED_LIST_PATTERN.matcher(line);
            Matcher unorderedMatcher = UNORDERED_LIST_PATTERN.matcher(line);
            String content = null;
            if (orderedMatcher.matches()) {
                content = orderedMatcher.group(1).trim();
            } else if (unorderedMatcher.matches()) {
                content = unorderedMatcher.group(1).trim();
            }

            if (!hasText(content)) {
                continue;
            }

            String title = abbreviate((currentSection + "-" + content).replace("：", "-"), 80);
            String caseType = inferCaseType(currentSection, content);
            String priority = inferCasePriority(currentSection, content);
            String precondition = "进入相关功能页面，并具备对应权限。";
            String remarks = content;
            List<TaskRequirementAiTestCaseStepSuggestion> steps = List.of(
                    new TaskRequirementAiTestCaseStepSuggestion(1, content, "结果符合需求预期")
            );

            derived.add(new TaskRequirementAiTestCaseSuggestion(
                    title,
                    inferModuleName(currentSection),
                    caseType,
                    priority,
                    precondition,
                    remarks,
                    steps
            ));
        }

        return derived;
    }

    private TaskEntity requireRequirementTask(Long taskId) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + taskId));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireTaskVisible(task);
        }
        if (!"需求".equals(defaultString(task.getWorkItemType()))) {
            throw new IllegalArgumentException("仅需求类型工作项支持 AI 助手");
        }
        return task;
    }

    private AiModelConfigEntity resolveModelConfig(Long modelConfigId) {
        if (modelConfigId != null) {
            return aiModelConfigRepository.findById(modelConfigId)
                    .filter(AiModelConfigEntity::getEnabled)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId));
        }
        return aiModelConfigRepository.findAllByEnabledTrueOrderByIdAsc().stream()
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("没有可用的已启用模型配置"));
    }

    private String normalizeAction(String action) {
        String value = trimToNull(action);
        if (value == null) {
            throw new IllegalArgumentException("AI 动作不能为空");
        }
        value = value.toUpperCase(Locale.ROOT);
        if (!ACTION_STANDARDIZE.equals(value)
                && !ACTION_BREAKDOWN.equals(value)
                && !ACTION_TEST_CASES.equals(value)) {
            throw new IllegalArgumentException("不支持的 AI 动作");
        }
        return value;
    }

    private String standardizePrompt() {
        return """
                你是资深产品经理，负责把原始需求整理成清晰、可执行的 Markdown 需求说明。
                严格要求：
                1. 只输出最终 Markdown 内容。
                2. 不要输出思考过程，不要输出分析过程，不要输出 <think> 标签。
                3. 不要使用代码块包裹结果。
                4. 只允许输出以下二级标题，且顺序固定：用户故事、需求描述、验收标准。
                5. 每个章节都必须有内容，不允许留空。
                6. 不要输出额外的二级标题。
                7. 表达尽量具体、可执行。
                8. 需求描述中可以结合原型链接补充页面行为、交互和约束。
                输出格式必须严格如下：
                ## 用户故事

                ...

                ## 需求描述

                ...

                ## 验收标准

                ...
                """;
    }

    private String breakdownPrompt() {
        return """
                你是技术负责人，请将需求拆解为可执行任务。
                严格要求：
                1. 只输出 JSON 对象，不要输出思考过程，不要输出分析过程，不要输出 <think> 标签。
                2. 不要使用 Markdown 代码块包裹 JSON。
                3. JSON 格式如下：
                {
                  "markdown": "## 拆解建议\\n- ...",
                  "tasks": [
                    {
                      "name": "任务标题",
                      "category": "开发",
                      "priority": "中",
                      "description": "任务说明"
                    }
                  ]
                }
                4. tasks 最多 8 条。
                5. category 仅允许：需求设计、UI设计、技术设计、开发、测试、部署。
                6. priority 仅允许：高、中、低。
                7. description 使用 Markdown。
                8. 不要生成“需求澄清”“需求确认”“与产品确认”等沟通类任务，直接按已知需求拆解可执行任务。
                """;
    }

    private String testCasesPrompt() {
        return """
                你是资深 QA，请基于需求生成测试用例。
                严格要求：
                1. 只输出 JSON 对象，不要输出思考过程，不要输出分析过程，不要输出 <think> 标签。
                2. 不要使用 Markdown 代码块包裹 JSON。
                3. JSON 格式如下：
                {
                  "markdown": "## 测试用例建议\\n- ...",
                  "testCases": [
                    {
                      "title": "用例标题",
                      "moduleName": "功能模块",
                      "caseType": "功能测试",
                      "priority": "P2",
                      "precondition": "前置条件",
                      "remarks": "备注",
                      "steps": [
                        {
                          "stepNo": 1,
                          "action": "执行步骤",
                          "expectedResult": "预期结果"
                        }
                      ]
                    }
                  ]
                }
                4. testCases 最多 6 条。
                5. 每条用例最多 4 个步骤。
                6. caseType 仅允许：功能测试、接口测试、回归测试、异常测试、兼容性测试、性能测试。
                7. priority 仅允许：P0、P1、P2、P3。
                8. markdown 中只保留测试设计结论，不要重复输出整段 JSON。
                """;
    }

    private String testCasesFallbackPrompt() {
        return """
                你是资深 QA，请基于需求输出精简测试用例建议。
                严格要求：
                1. 只输出 Markdown，不要输出 JSON，不要输出 <think>。
                2. 最多输出 6 条测试用例建议。
                3. 每条建议使用有序列表。
                4. 每条内容应是一条完整可执行的测试场景。
                5. 按“功能测试、异常测试、边界测试、权限测试”分组输出。
                """;
    }

    private String buildTaskContext(TaskEntity task) {
        return """
                需求标题：%s
                项目：%s
                所属迭代：%s
                当前状态：%s
                优先级：%s
                原型链接：%s
                当前描述：
                %s
                """.formatted(
                task.getName(),
                task.getProject().getName(),
                task.getIteration() == null ? "未规划" : task.getIteration().getName(),
                defaultString(task.getStatus()),
                defaultString(task.getPriority()),
                defaultString(task.getPrototypeUrl()),
                defaultString(task.getDescription())
        ).trim();
    }

    private String invokePrompt(AiModelConfigEntity modelConfig, String systemPrompt, String userPrompt, int maxTokens) {
        return modelConfigService.invokePrompt(
                modelConfigService.resolveModelConfig(modelConfig.getId()),
                systemPrompt,
                userPrompt,
                maxTokens
        );
    }

    private String cleanMarkdownOutput(String raw) {
        String cleaned = stripThinkingContent(raw);
        cleaned = stripMarkdownCodeFence(cleaned);

        try {
            JsonNode root = objectMapper.readTree(cleaned);
            if (root.hasNonNull("markdown") && hasText(root.path("markdown").asText())) {
                return root.path("markdown").asText().trim();
            }
        } catch (Exception ignored) {
        }

        return defaultString(cleaned);
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
        String cleaned = defaultString(raw);
        cleaned = THINK_BLOCK_PATTERN.matcher(cleaned).replaceAll("").trim();
        int closingThinkIndex = cleaned.toLowerCase(Locale.ROOT).indexOf("</think>");
        if (closingThinkIndex >= 0) {
            cleaned = cleaned.substring(closingThinkIndex + "</think>".length()).trim();
        }
        return cleaned;
    }

    private String stripMarkdownCodeFence(String value) {
        String cleaned = value.trim();
        Matcher codeBlockMatcher = GENERIC_CODE_BLOCK_PATTERN.matcher(cleaned);
        if (codeBlockMatcher.matches()) {
            return codeBlockMatcher.group(1).trim();
        }
        return cleaned;
    }

    private String normalizeTaskCategory(String category) {
        String value = trimToNull(category);
        if (value == null) {
            return "开发";
        }
        return switch (value) {
            case "需求设计", "UI设计", "技术设计", "开发", "测试", "部署" -> value;
            default -> "开发";
        };
    }

    private String normalizeTaskPriority(String priority) {
        String value = trimToNull(priority);
        if (value == null) {
            return "中";
        }
        return switch (value) {
            case "高", "中", "低" -> value;
            default -> "中";
        };
    }

    private String normalizeCaseType(String caseType) {
        String value = trimToNull(caseType);
        if (value == null) {
            return "功能测试";
        }
        return switch (value) {
            case "功能测试", "接口测试", "回归测试", "异常测试", "兼容性测试", "性能测试" -> value;
            default -> "功能测试";
        };
    }

    private String normalizeCasePriority(String priority) {
        String value = trimToNull(priority);
        if (value == null) {
            return "P2";
        }
        return switch (value) {
            case "P0", "P1", "P2", "P3" -> value;
            default -> "P2";
        };
    }

    private String inferCaseType(String section, String content) {
        String merged = (defaultString(section) + " " + defaultString(content)).toLowerCase(Locale.ROOT);
        if (merged.contains("异常")) {
            return "异常测试";
        }
        if (merged.contains("接口")) {
            return "接口测试";
        }
        if (merged.contains("回归")) {
            return "回归测试";
        }
        if (merged.contains("兼容")) {
            return "兼容性测试";
        }
        if (merged.contains("性能")) {
            return "性能测试";
        }
        return "功能测试";
    }

    private String inferCasePriority(String section, String content) {
        String merged = defaultString(section) + " " + defaultString(content);
        if (merged.contains("核心") || merged.contains("主流程") || merged.contains("关键")) {
            return "P1";
        }
        if (merged.contains("权限") || merged.contains("异常")) {
            return "P1";
        }
        return "P2";
    }

    private String inferModuleName(String section) {
        String value = trimToNull(section);
        return value == null ? "需求功能" : value;
    }

    private String abbreviate(String value, int maxLength) {
        if (!hasText(value)) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private record TestCaseParseResult(
            String markdown,
            List<TaskRequirementAiTestCaseSuggestion> suggestions
    ) {
    }
}
