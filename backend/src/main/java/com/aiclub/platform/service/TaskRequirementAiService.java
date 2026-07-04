package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentInvocationContext;
import com.aiclub.platform.agentusage.AgentInvocationRecorder;
import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.TriggerSource;
import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.dto.TaskRequirementAiSuggestion;
import com.aiclub.platform.dto.TaskRequirementAiTestCaseStepSuggestion;
import com.aiclub.platform.dto.TaskRequirementAiTestCaseSuggestion;
import com.aiclub.platform.dto.request.TaskRequirementAiRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Transactional(readOnly = true)
public class TaskRequirementAiService {

    private static final String ACTION_STANDARDIZE = "STANDARDIZE";
    private static final String ACTION_BREAKDOWN = "BREAKDOWN";
    private static final String ACTION_TEST_CASES = "TEST_CASES";

    /** AI 动作到内置智能体编码的映射，用于查找管理员在智能体管理中绑定的默认模型。 */
    private static final Map<String, String> ACTION_TO_BUILTIN_AGENT = Map.of(
            ACTION_STANDARDIZE, "REQUIREMENT_AI_STANDARDIZE",
            ACTION_BREAKDOWN, "REQUIREMENT_AI_BREAKDOWN",
            ACTION_TEST_CASES, "REQUIREMENT_AI_TEST_CASES"
    );

    private static final Pattern THINK_BLOCK_PATTERN = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern JSON_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```json\\s*(\\{.*?})\\s*```");
    private static final Pattern GENERIC_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```(?:markdown|md)?\\s*(.*?)\\s*```");
    private static final Pattern ANY_CODE_BLOCK_PATTERN = Pattern.compile("(?is)```\\w*\\s*(.*?)\\s*```");
    private static final Pattern ORDERED_LIST_PATTERN = Pattern.compile("^\\d+\\.\\s+(.+)$");
    private static final Pattern UNORDERED_LIST_PATTERN = Pattern.compile("^[-*]\\s+(.+)$");
    private static final Pattern MARKDOWN_TABLE_ROW_PATTERN = Pattern.compile("^\\|(.+)\\|$");
    private static final Pattern BOLD_TITLE_PATTERN = Pattern.compile("^\\*\\*(.+?)\\*\\*[:：]?\\s*(.*)$");

    private static final Logger log = LoggerFactory.getLogger(TaskRequirementAiService.class);

    private final TaskRepository taskRepository;
    private final AiModelConfigRepository aiModelConfigRepository;
    private final AgentRepository agentRepository;
    private final ModelConfigService modelConfigService;
    private final ObjectMapper objectMapper;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final AgentInvocationRecorder agentInvocationRecorder;

    public TaskRequirementAiService(TaskRepository taskRepository,
                                    AiModelConfigRepository aiModelConfigRepository,
                                    AgentRepository agentRepository,
                                    ModelConfigService modelConfigService,
                                    ObjectMapper objectMapper,
                                    ProjectDataPermissionService projectDataPermissionService,
                                    AgentInvocationRecorder agentInvocationRecorder) {
        this.taskRepository = taskRepository;
        this.aiModelConfigRepository = aiModelConfigRepository;
        this.agentRepository = agentRepository;
        this.modelConfigService = modelConfigService;
        this.objectMapper = objectMapper;
        this.projectDataPermissionService = projectDataPermissionService;
        this.agentInvocationRecorder = agentInvocationRecorder;
    }

    public TaskRequirementAiResult generate(Long taskId, TaskRequirementAiRequest request) {
        String action = normalizeAction(request.action());
        TaskEntity task = requireSupportedAiWorkItem(taskId, action);
        AiModelConfigEntity modelConfig = resolveModelConfig(request.modelConfigId(), action);

        return switch (action) {
            case ACTION_STANDARDIZE -> buildMarkdownResult(
                    ACTION_STANDARDIZE,
                    "标准化需求",
                    task,
                    modelConfig,
                    standardizePrompt(),
                    buildTaskContext(task, action),
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
        String raw = invokePrompt(action, task, modelConfig, systemPrompt, userPrompt, maxTokens, false);
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
        String raw = invokePrompt(ACTION_BREAKDOWN, task, modelConfig, breakdownPrompt(), buildTaskContext(task, ACTION_BREAKDOWN), 2600, false);
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
                        normalizeTaskType(firstText(node, "taskType", "category")),
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
            String raw = invokePrompt(ACTION_TEST_CASES, task, modelConfig, testCasesPrompt(), buildTaskContext(task, ACTION_TEST_CASES), 1800, true);
            TestCaseParseResult parsed = parseTestCaseResult(raw);
            markdown = parsed.markdown();
            testCaseSuggestions = parsed.suggestions();
            if (!hasText(markdown) && testCaseSuggestions.isEmpty()) {
                throw new IllegalStateException("测试用例结果为空");
            }
        } catch (RuntimeException ex) {
            primaryFailure = ex;
            log.warn("需求 AI 测试用例主流程解析失败，尝试兜底提示词。原因: {}", ex.getMessage());
        }

        if (!hasText(markdown) && testCaseSuggestions.isEmpty()) {
            String fallbackRaw = invokePrompt(ACTION_TEST_CASES, task, modelConfig, testCasesFallbackPrompt(), buildTaskContext(task, ACTION_TEST_CASES), 1200, false);
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
        } catch (Exception ex) {
            log.warn("需求 AI 测试用例 JSON 解析失败，尝试从 Markdown 推导。原始响应前 500 字符: {}",
                    abbreviate(raw, 500));
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
        boolean inTable = false;

        for (String rawLine : defaultString(markdown).replace("\r\n", "\n").split("\n")) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                inTable = false;
                continue;
            }

            if (line.startsWith("###")) {
                currentSection = line.substring(3).trim();
                inTable = false;
                continue;
            }
            if (line.startsWith("##")) {
                inTable = false;
                continue;
            }

            Matcher tableRowMatcher = MARKDOWN_TABLE_ROW_PATTERN.matcher(line);
            if (tableRowMatcher.matches()) {
                String rowContent = tableRowMatcher.group(1).trim();
                if (rowContent.contains("---") || rowContent.contains("标题") || rowContent.contains("用例")) {
                    inTable = true;
                    continue;
                }
                if (inTable) {
                    String[] cells = rowContent.split("\\|");
                    if (cells.length >= 2) {
                        String title = cells[0].trim();
                        if (hasText(title)) {
                            String content = cells.length >= 2 ? cells[Math.min(cells.length - 1, 1)].trim() : title;
                            derived.add(buildDerivedCase(currentSection, title, content));
                        }
                    }
                }
                continue;
            }

            Matcher boldMatcher = BOLD_TITLE_PATTERN.matcher(line);
            if (boldMatcher.matches()) {
                String title = boldMatcher.group(1).trim();
                String content = boldMatcher.group(2).trim();
                if (hasText(title)) {
                    derived.add(buildDerivedCase(currentSection, title, hasText(content) ? content : title));
                }
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

            derived.add(buildDerivedCase(currentSection,
                    abbreviate((currentSection + "-" + content).replace("：", "-"), 80),
                    content));
        }

        return derived;
    }

    private TaskRequirementAiTestCaseSuggestion buildDerivedCase(String section, String title, String content) {
        return new TaskRequirementAiTestCaseSuggestion(
                title,
                inferModuleName(section),
                inferCaseType(section, content),
                inferCasePriority(section, content),
                "进入相关功能页面，并具备对应权限。",
                content,
                List.of(new TaskRequirementAiTestCaseStepSuggestion(1, content, "结果符合需求预期"))
        );
    }

    private TaskEntity requireSupportedAiWorkItem(Long taskId, String action) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("工作项不存在: " + taskId));
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.currentScopeOrNull();
        if (scope != null) {
            projectDataPermissionService.requireTaskVisible(task);
        }
        if ("需求".equals(defaultString(task.getWorkItemType()))) {
            return task;
        }
        // 测试任务只开放测试用例生成，避免其它需求 AI 能力误用于任务工作项。
        if (ACTION_TEST_CASES.equals(action)) {
            if ("任务".equals(defaultString(task.getWorkItemType()))
                    && "测试任务".equals(normalizeTaskType(task.getTaskType()))) {
                return task;
            }
            throw new IllegalArgumentException("仅需求或测试任务支持生成测试用例");
        }
        throw new IllegalArgumentException("仅需求类型工作项支持 AI 助手");
    }

    private TaskEntity requireRequirementTask(Long taskId) {
        return requireSupportedAiWorkItem(taskId, ACTION_STANDARDIZE);
    }

    /**
     * 解析模型配置。优先级：
     * 1. 请求显式指定的 modelConfigId
     * 2. 对应动作的内置智能体所绑定的模型（管理员可在智能体管理中配置）
     * 3. 回退到第一个已启用的 CHAT 模型配置
     */
    private AiModelConfigEntity resolveModelConfig(Long modelConfigId, String action) {
        if (modelConfigId != null) {
            AiModelConfigEntity modelConfig = aiModelConfigRepository.findById(modelConfigId)
                    .orElseThrow(() -> new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId));
            if (!Boolean.TRUE.equals(modelConfig.getEnabled())) {
                throw new NoSuchElementException("模型配置不存在或未启用: " + modelConfigId);
            }
            if (!isChatModelConfig(modelConfig)) {
                throw new IllegalArgumentException("需求 AI 助手仅支持对话模型配置");
            }
            return modelConfig;
        }
        // 尝试从对应动作的内置智能体获取模型配置
        String builtinCode = ACTION_TO_BUILTIN_AGENT.get(action);
        if (builtinCode != null) {
            AiModelConfigEntity agentModel = agentRepository.findFirstByBuiltinCodeAndEnabledTrue(builtinCode)
                    .map(AgentEntity::getAiModelConfig)
                    .filter(mc -> Boolean.TRUE.equals(mc.getEnabled()))
                    .orElse(null);
            if (agentModel != null) {
                return agentModel;
            }
        }
        return aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT).stream()
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("没有可用的已启用对话模型配置"));
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
                4. 只允许输出以下一级标题，且顺序固定：用户故事、需求描述、验收标准。
                5. 每个章节都必须有内容，不允许留空。
                6. 不要输出额外的一级标题。
                7. 表达尽量具体、可执行。
                8. 需求描述中可以结合原型链接补充页面行为、交互和约束。
                输出格式必须严格如下：
                # 用户故事

                ...

                # 需求描述

                ...

                # 验收标准

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
                      "taskType": "开发任务",
                      "priority": "中",
                      "description": "任务说明"
                    }
                  ]
                }
                4. tasks 最多 8 条。
                5. taskType 仅允许：需求设计、UI设计、技术设计、开发任务、测试任务、运维任务。
                6. priority 仅允许：高、中、低。
                7. description 使用 Markdown。
                8. 不要生成“需求澄清”“需求确认”“与产品确认”等沟通类任务，直接按已知需求拆解可执行任务。
                """;
    }


    private String testCasesPrompt() {
        return """
                你是资深 QA，请基于需求生成测试用例。

                【重要】你必须且只能输出一个合法的 JSON 对象，不要输出任何其他文字、解释或标签。如果你输出了非 JSON 内容，整个响应将被丢弃。

                输出格式（严格按此结构，参考示例）：
                {
                  "markdown": "## 测试用例建议\\n\\n### 功能测试\\n1. 验证用户登录功能\\n2. 验证数据展示\\n\\n### 异常测试\\n3. 验证空数据场景\\n4. 验证网络异常场景",
                  "testCases": [
                    {
                      "title": "验证用户登录功能",
                      "moduleName": "用户模块",
                      "caseType": "功能测试",
                      "priority": "P1",
                      "precondition": "用户已注册且账号状态正常",
                      "remarks": "覆盖正常登录流程",
                      "steps": [
                        { "stepNo": 1, "action": "打开登录页面", "expectedResult": "页面正常加载，显示登录表单" },
                        { "stepNo": 2, "action": "输入正确的用户名和密码，点击登录", "expectedResult": "登录成功，跳转到首页" }
                      ]
                    }
                  ]
                }

                规则：
                1. testCases 最多 6 条。
                2. 每条用例最多 4 个步骤。
                3. caseType 仅允许：功能测试、接口测试、回归测试、异常测试、兼容性测试、性能测试。
                4. priority 仅允许：P0、P1、P2、P3。
                5. markdown 中只保留测试设计结论，不要重复输出整段 JSON。
                6. 直接输出 JSON，不要用 ```json 包裹，不要输出  thinking 标签。
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

    private String buildTaskContext(TaskEntity task, String action) {
        if (ACTION_TEST_CASES.equals(action)
                && "任务".equals(defaultString(task.getWorkItemType()))
                && "测试任务".equals(normalizeTaskType(task.getTaskType()))) {
            return buildTestingTaskContext(task);
        }
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

    /**
     * 测试任务生成用例时以当前测试任务为主，并补充关联需求摘要，让 QA 智能体同时理解测试范围和业务背景。
     */
    private String buildTestingTaskContext(TaskEntity task) {
        TaskEntity requirementTask = task.getRequirementTask();
        String requirementSummary = "未关联需求";
        if (requirementTask != null) {
            requirementSummary = """
                    关联需求标题：%s
                    关联需求状态：%s
                    关联需求优先级：%s
                    关联需求原型链接：%s
                    关联需求描述：
                    %s
                    """.formatted(
                    defaultString(requirementTask.getName()),
                    defaultString(requirementTask.getStatus()),
                    defaultString(requirementTask.getPriority()),
                    defaultString(requirementTask.getPrototypeUrl()),
                    defaultString(requirementTask.getDescription())
            ).trim();
        }
        return """
                测试任务标题：%s
                项目：%s
                所属迭代：%s
                当前状态：%s
                优先级：%s
                测试任务描述：
                %s

                关联需求摘要：
                %s
                """.formatted(
                task.getName(),
                task.getProject().getName(),
                task.getIteration() == null ? "未规划" : task.getIteration().getName(),
                defaultString(task.getStatus()),
                defaultString(task.getPriority()),
                defaultString(task.getDescription()),
                requirementSummary
        ).trim();
    }

    private String invokePrompt(AiModelConfigEntity modelConfig, String systemPrompt, String userPrompt, int maxTokens, boolean jsonMode) {
        return invokePrompt(null, null, modelConfig, systemPrompt, userPrompt, maxTokens, jsonMode);
    }

    private String invokePrompt(String action, TaskEntity task, AiModelConfigEntity modelConfig, String systemPrompt, String userPrompt, int maxTokens, boolean jsonMode) {
        AgentType agentType = actionToAgentType(action);
        AgentInvocationContext.Builder ctxBuilder = AgentInvocationContext.builder(agentType)
                .action(action)
                .modelConfig(modelConfig)
                .inputChars((systemPrompt == null ? 0 : systemPrompt.length()) + (userPrompt == null ? 0 : userPrompt.length()));
        if (task != null) {
            ctxBuilder.taskId(task.getId());
            if (task.getProject() != null) {
                ctxBuilder.projectId(task.getProject().getId());
            }
        }
        return agentInvocationRecorder.trackWithUsage(ctxBuilder.build(), sink -> {
            ModelConfigService.ModelInvocation inv = modelConfigService.invokePromptWithUsage(
                    modelConfigService.resolveModelConfig(modelConfig.getId()),
                    systemPrompt,
                    userPrompt,
                    maxTokens,
                    jsonMode
            );
            sink.setUsage(inv.promptTokens(), inv.completionTokens(), inv.totalTokens());
            sink.setOutputChars(inv.text() == null ? 0 : inv.text().length());
            return inv.text();
        });
    }

    /**
     * 根据 action 字符串获取对应的 AgentType 枚举。
     */
    private static AgentType actionToAgentType(String action) {
        if (action == null) return AgentType.REQUIREMENT_AI_STANDARDIZE;
        return switch (action) {
            case ACTION_STANDARDIZE -> AgentType.REQUIREMENT_AI_STANDARDIZE;
            case ACTION_BREAKDOWN -> AgentType.REQUIREMENT_AI_BREAKDOWN;
            case ACTION_TEST_CASES -> AgentType.REQUIREMENT_AI_TEST_CASES;
            default -> AgentType.REQUIREMENT_AI_STANDARDIZE;
        };
    }

    /**
     * 需求 AI 目前只支持文本生成链路，这里显式过滤掉 Embedding 模型，避免默认取值误入。
     */
    private boolean isChatModelConfig(AiModelConfigEntity modelConfig) {
        return ModelConfigService.MODEL_TYPE_CHAT.equalsIgnoreCase(defaultString(modelConfig.getModelType()));
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

        Matcher anyCodeBlockMatcher = ANY_CODE_BLOCK_PATTERN.matcher(cleaned);
        if (anyCodeBlockMatcher.find()) {
            String content = anyCodeBlockMatcher.group(1).trim();
            if (content.startsWith("{")) {
                return content;
            }
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

    private String normalizeTaskType(String taskType) {
        String value = trimToNull(taskType);
        if (value == null) {
            return "开发任务";
        }
        return switch (value) {
            case "需求设计", "UI设计", "技术设计", "开发任务", "测试任务", "运维任务" -> value;
            case "开发" -> "开发任务";
            case "测试" -> "测试任务";
            case "部署", "运维", "部署任务" -> "运维任务";
            default -> "开发任务";
        };
    }

    private String firstText(JsonNode node, String... fieldNames) {
        if (node == null) {
            return "";
        }
        for (String fieldName : fieldNames) {
            String value = trimToNull(node.path(fieldName).asText());
            if (value != null) {
                return value;
            }
        }
        return "";
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
