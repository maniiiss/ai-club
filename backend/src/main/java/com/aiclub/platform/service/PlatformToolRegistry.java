package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformToolConfigEntity;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.repository.PlatformToolConfigRepository;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 平台工具注册中心。
 * 工具实现由代码注册，数据库只承担启停和描述覆盖。
 */
@Service
public class PlatformToolRegistry {

    public static final String TOOL_PROJECT_SEARCH = "project.search";
    public static final String TOOL_PROJECT_GET_DETAIL = "project.get_detail";
    public static final String TOOL_PROJECT_LIST_ITERATIONS = "project.list_iterations";
    public static final String TOOL_USER_RESOLVE_PROJECT_MEMBER = "user.resolve_project_member";
    public static final String TOOL_USER_LIST_PROJECT_MEMBERS = "user.list_project_members";
    public static final String TOOL_WORK_ITEM_SEARCH = "work_item.search";
    public static final String TOOL_WORK_ITEM_GET_DETAIL = "work_item.get_detail";
    public static final String TOOL_WORK_ITEM_CREATE_DRAFT = "work_item.create_draft";
    public static final String TOOL_WORK_ITEM_ASSIGN = "work_item.assign";
    public static final String TOOL_AGENT_LIST_AVAILABLE = "agent.list_available";
    public static final String TOOL_AGENT_GET_DETAIL = "agent.get_detail";
    public static final String TOOL_GITLAB_BINDING_SEARCH = "gitlab_binding.search";
    public static final String TOOL_REPO_SCAN_START = "repo_scan.start";
    public static final String TOOL_REPO_SCAN_SEARCH = "repo_scan.search";
    public static final String TOOL_REPO_SCAN_LIST_RULESETS = "repo_scan.list_rulesets";
    public static final String TOOL_EXECUTION_TASK_SEARCH = "execution_task.search";
    public static final String TOOL_EXECUTION_TASK_GET_DETAIL = "execution_task.get_detail";
    public static final String TOOL_EXECUTION_TASK_CREATE = "execution_task.create";
    public static final String TOOL_EXECUTION_TASK_RETRY = "execution_task.retry";
    public static final String TOOL_EXECUTION_TASK_CANCEL = "execution_task.cancel";
    public static final String TOOL_TEST_PLAN_SEARCH = "test_plan.search";
    public static final String TOOL_TEST_PLAN_GET_DETAIL = "test_plan.get_detail";
    public static final String TOOL_TEST_PLAN_CREATE_DRAFT = "test_plan.create_draft";
    public static final String TOOL_TEST_CASE_APPEND = "test_case.append";
    public static final String TOOL_DOCUMENT_CONVERT_MARKDOWN = "document.convert_markdown";
    public static final String TOOL_WIKI_SPACE_SEARCH = "wiki_space.search";
    public static final String TOOL_WIKI_PAGE_GET_DETAIL = "wiki_page.get_detail";

    private final PlatformToolConfigRepository platformToolConfigRepository;
    private final Map<String, PlatformToolDefinition> definitions;

    public PlatformToolRegistry(PlatformToolConfigRepository platformToolConfigRepository) {
        this.platformToolConfigRepository = platformToolConfigRepository;
        this.definitions = buildDefinitions();
    }

    public List<PlatformToolDefinition> listDefinitions() {
        return definitions.values().stream().map(this::applyConfig).toList();
    }

    public PlatformToolDefinition requireDefinition(String toolCode) {
        PlatformToolDefinition definition = definitions.get(toolCode);
        if (definition == null) {
            throw new NoSuchElementException("平台工具不存在: " + toolCode);
        }
        return applyConfig(definition);
    }

    public boolean isEnabled(String toolCode) {
        PlatformToolDefinition definition = requireDefinition(toolCode);
        return platformToolConfigRepository.findByToolCode(toolCode)
                .map(PlatformToolConfigEntity::isEnabled)
                .orElse(true)
                && definition != null;
    }

    /**
     * 判断指定工具是否允许被 Hermes 自动执行。
     * 对于没有显式配置覆盖的只读工具，默认视为允许自动执行，保持与首版设计一致。
     */
    public boolean isAllowAutoExecute(String toolCode) {
        PlatformToolDefinition definition = requireDefinition(toolCode);
        if (!definition.readOnly() || !isEnabled(toolCode)) {
            return false;
        }
        return platformToolConfigRepository.findByToolCode(toolCode)
                .map(PlatformToolConfigEntity::isAllowAutoExecute)
                .orElse(true);
    }

    /**
     * 列出当前对 Hermes 可见的只读工具目录。
     */
    public List<PlatformToolDefinition> listAutoExecutableReadTools() {
        return definitions.keySet().stream()
                .filter(this::isAllowAutoExecute)
                .map(this::requireDefinition)
                .toList();
    }

    private PlatformToolDefinition applyConfig(PlatformToolDefinition definition) {
        return platformToolConfigRepository.findByToolCode(definition.code())
                .map(config -> new PlatformToolDefinition(
                        definition.code(),
                        hasText(config.getDisplayName()) ? config.getDisplayName() : definition.name(),
                        definition.moduleCode(),
                        hasText(config.getDescriptionOverride()) ? config.getDescriptionOverride() : definition.description(),
                        definition.readOnly(),
                        definition.riskLevel(),
                        definition.permissionCode(),
                        definition.requiresConfirm(),
                        definition.inputSchema(),
                        definition.outputSchema()
                ))
                .orElse(definition);
    }

    private Map<String, PlatformToolDefinition> buildDefinitions() {
        LinkedHashMap<String, PlatformToolDefinition> result = new LinkedHashMap<>();
        register(result, TOOL_PROJECT_SEARCH, "搜索项目", "PROJECT", "按名称或状态搜索当前用户可见项目", true, "LOW", "project:view", false,
                schema("keyword", "项目关键词"),
                projectOutputSchema());
        register(result, TOOL_PROJECT_GET_DETAIL, "项目详情", "PROJECT", "读取项目摘要与成员信息", true, "LOW", "project:view", false,
                schema("projectId", "项目ID"),
                projectOutputSchema());
        register(result, TOOL_PROJECT_LIST_ITERATIONS, "项目迭代列表", "PROJECT", "读取项目迭代列表", true, "LOW", "project:view", false,
                schema("projectId", "项目ID"),
                iterationOutputSchema());
        register(result, TOOL_USER_RESOLVE_PROJECT_MEMBER, "解析项目成员", "USER", "按昵称或用户名解析项目成员", true, "LOW", "project:view", false,
                schema("projectId", "项目ID", "keyword", "成员关键词"),
                projectMemberOutputSchema());
        register(result, TOOL_USER_LIST_PROJECT_MEMBERS, "项目成员列表", "USER", "列出项目负责人、创建人和成员", true, "LOW", "project:view", false,
                schema("projectId", "项目ID"),
                projectMemberOutputSchema());
        register(result, TOOL_WORK_ITEM_SEARCH, "搜索工作项", "WORK_ITEM", "按标题、编号或说明搜索需求/任务/缺陷", true, "LOW", "task:view", false,
                schema("keyword", "工作项关键词", "projectId", "项目ID"),
                workItemOutputSchema());
        register(result, TOOL_WORK_ITEM_GET_DETAIL, "工作项详情", "WORK_ITEM", "读取工作项详情和评论摘要", true, "LOW", "task:view", false,
                schema("workItemId", "工作项ID"),
                workItemOutputSchema());
        register(result, TOOL_WORK_ITEM_CREATE_DRAFT, "创建工作项草稿", "WORK_ITEM", "创建需求/任务/缺陷草稿", false, "MEDIUM", "task:manage", true,
                schema("projectId", "项目ID", "name", "标题", "content", "内容"),
                pendingActionOutputSchema("CREATE_WORK_ITEM_DRAFT", "确认后创建工作项草稿", "创建草稿所需的项目、标题、正文与负责人参数"));
        register(result, TOOL_WORK_ITEM_ASSIGN, "指派工作项", "WORK_ITEM", "修改工作项负责人或协作人", false, "MEDIUM", "task:manage", true,
                schema("workItemId", "工作项ID", "assigneeUserId", "负责人ID"),
                pendingActionOutputSchema("ASSIGN_WORK_ITEM", "确认后变更工作项负责人", "变更负责人所需的工作项与成员参数"));
        register(result, TOOL_AGENT_LIST_AVAILABLE, "可用 Agent 列表", "AGENT", "查询全局和项目可用 Agent", true, "LOW", "agent:view", false,
                schema("projectId", "项目ID"),
                agentOutputSchema());
        register(result, TOOL_AGENT_GET_DETAIL, "Agent 详情", "AGENT", "读取 Agent 类型、接入方式和能力", true, "LOW", "agent:view", false,
                schema("agentId", "Agent ID"),
                agentOutputSchema());
        register(result, TOOL_GITLAB_BINDING_SEARCH, "搜索仓库绑定", "GITLAB", "按项目名或仓库路径搜索 GitLab 绑定仓库", true, "LOW", "gitlab:view", false,
                schema("keyword", "仓库关键词"),
                gitlabBindingOutputSchema());
        register(result, TOOL_REPO_SCAN_LIST_RULESETS, "扫描规则集列表", "GITLAB", "列出可用于仓库规范扫描的规则集", true, "LOW", "gitlab:view", false,
                Map.of(),
                repoScanRulesetOutputSchema());
        register(result, TOOL_REPO_SCAN_START, "发起仓库扫描", "GITLAB", "基于指定绑定仓库创建仓库规范扫描任务", false, "MEDIUM", "gitlab:manage", true,
                schema("bindingId", "绑定ID", "branch", "分支", "rulesetCode", "规则集"),
                pendingActionOutputSchema("CREATE_REPOSITORY_SCAN_TASK", "确认后创建仓库规范扫描任务", "扫描提案所需的绑定仓库、规则集与分支参数"));
        register(result, TOOL_REPO_SCAN_SEARCH, "搜索仓库扫描", "GITLAB", "查询最近的仓库规范扫描任务", true, "LOW", "task:view", false,
                schema("bindingId", "绑定ID", "status", "任务状态"),
                executionTaskOutputSchema());
        register(result, TOOL_EXECUTION_TASK_SEARCH, "搜索执行任务", "EXECUTION", "按项目、工作项、状态或场景搜索执行任务", true, "LOW", "task:view", false,
                schema("keyword", "执行任务关键词"),
                executionTaskOutputSchema());
        register(result, TOOL_EXECUTION_TASK_GET_DETAIL, "执行任务详情", "EXECUTION", "读取执行任务、运行、步骤和产物", true, "LOW", "task:view", false,
                schema("executionTaskId", "执行任务ID"),
                executionTaskOutputSchema());
        register(result, TOOL_EXECUTION_TASK_CREATE, "创建执行任务", "EXECUTION", "基于工作项创建执行中心任务", false, "MEDIUM", "task:execution:create", true,
                schema("workItemId", "工作项ID", "scenarioCode", "执行场景"),
                pendingActionOutputSchema("CREATE_EXECUTION_TASK", "确认后创建执行中心任务", "执行任务提案所需的项目、工作项、场景与上下文参数"));
        register(result, TOOL_EXECUTION_TASK_RETRY, "重试执行任务", "EXECUTION", "重试执行中心任务", false, "MEDIUM", "task:execution:retry", true,
                schema("executionTaskId", "执行任务ID"),
                pendingActionOutputSchema("RETRY_EXECUTION_TASK", "确认后重试执行任务", "重试动作所需的执行任务标识"));
        register(result, TOOL_EXECUTION_TASK_CANCEL, "取消执行任务", "EXECUTION", "取消执行中心任务", false, "MEDIUM", "task:execution:cancel", true,
                schema("executionTaskId", "执行任务ID"),
                pendingActionOutputSchema("CANCEL_EXECUTION_TASK", "确认后取消执行任务", "取消动作所需的执行任务标识"));
        register(result, TOOL_TEST_PLAN_SEARCH, "搜索测试计划", "TEST", "按项目、迭代、状态或关键词查询测试计划", true, "LOW", "test:view", false,
                schema("keyword", "测试计划关键词"),
                testPlanOutputSchema());
        register(result, TOOL_TEST_PLAN_GET_DETAIL, "测试计划详情", "TEST", "读取测试计划和测试用例", true, "LOW", "test:view", false,
                schema("testPlanId", "测试计划ID"),
                testPlanOutputSchema());
        register(result, TOOL_TEST_PLAN_CREATE_DRAFT, "创建测试计划草稿", "TEST", "创建测试计划草稿", false, "MEDIUM", "test:manage", true,
                schema("projectId", "项目ID", "iterationId", "迭代ID", "name", "名称"),
                pendingActionOutputSchema("CREATE_TEST_PLAN_DRAFT", "确认后创建测试计划草稿", "测试计划草稿所需的项目、迭代与名称参数"));
        register(result, TOOL_TEST_CASE_APPEND, "追加测试用例", "TEST", "向测试计划追加测试用例", false, "MEDIUM", "test:manage", true,
                schema("testPlanId", "测试计划ID", "cases", "测试用例"),
                pendingActionOutputSchema("APPEND_TEST_CASES", "确认后向测试计划追加测试用例", "追加测试用例所需的测试计划标识与用例列表"));
        register(result, TOOL_DOCUMENT_CONVERT_MARKDOWN, "文档转 Markdown", "DOCUMENT", "读取指定文档资产并转换为 Markdown，供 Wiki 导入、Hermes 附件理解和智能体工具调用复用", true, "LOW", "", false,
                schema("assetId", "文档资产ID", "scene", "转换场景，例如 WIKI_IMPORT 或 HERMES_ATTACHMENT", "maxChars", "最大保留字符数"),
                documentMarkdownOutputSchema());
        return result;
    }

    private void register(Map<String, PlatformToolDefinition> result,
                          String code,
                          String name,
                          String moduleCode,
                          String description,
                          boolean readOnly,
                          String riskLevel,
                          String permissionCode,
                          boolean requiresConfirm,
                          Map<String, String> inputSchema,
                          Map<String, String> outputSchema) {
        result.put(code, new PlatformToolDefinition(code, name, moduleCode, description, readOnly, riskLevel, permissionCode, requiresConfirm, inputSchema, outputSchema));
    }

    /**
     * 使用保序 Map 维护工具 schema 字段顺序，便于在描述中稳定展示。
     */
    private Map<String, String> schema(String... keyValues) {
        LinkedHashMap<String, String> result = new LinkedHashMap<>();
        if (keyValues == null) {
            return Map.of();
        }
        for (int index = 0; index + 1 < keyValues.length; index += 2) {
            String key = keyValues[index];
            String value = keyValues[index + 1];
            if (!hasText(key) || !hasText(value)) {
                continue;
            }
            result.put(key, value);
        }
        return result.isEmpty() ? Map.of() : Collections.unmodifiableMap(result);
    }

    private Map<String, String> projectOutputSchema() {
        return schema(
                "summary", "本次项目检索/读取结果摘要",
                "candidates[]", "项目候选列表",
                "candidates[].id", "项目ID",
                "candidates[].title", "项目名称",
                "candidates[].subtitle", "项目状态与负责人摘要",
                "candidates[].route", "前端项目入口路由",
                "candidates[].payload.projectId", "项目ID",
                "candidates[].payload.projectName", "项目名称",
                "candidates[].payload.status", "项目状态",
                "candidates[].payload.owner", "项目负责人",
                "metadata", "回显本次查询上下文"
        );
    }

    private Map<String, String> iterationOutputSchema() {
        return schema(
                "summary", "本次项目迭代查询摘要",
                "candidates[]", "迭代候选列表",
                "candidates[].id", "迭代ID",
                "candidates[].title", "迭代名称",
                "candidates[].subtitle", "迭代状态与目标摘要",
                "candidates[].route", "前端迭代入口路由",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.status", "迭代状态",
                "metadata.projectId", "查询使用的项目ID"
        );
    }

    private Map<String, String> projectMemberOutputSchema() {
        return schema(
                "summary", "本次项目成员查询摘要",
                "candidates[]", "成员候选列表",
                "candidates[].id", "用户ID",
                "candidates[].title", "成员显示名",
                "candidates[].subtitle", "用户名摘要",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.userId", "用户ID",
                "candidates[].payload.username", "用户名",
                "candidates[].payload.nickname", "昵称",
                "metadata", "回显项目ID与搜索关键词"
        );
    }

    private Map<String, String> workItemOutputSchema() {
        return schema(
                "summary", "本次工作项查询摘要",
                "candidates[]", "工作项候选列表",
                "candidates[].id", "工作项ID",
                "candidates[].title", "工作项编号与标题",
                "candidates[].subtitle", "工作项类型、状态与所属项目摘要",
                "candidates[].route", "前端工作项入口路由",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.workItemId", "工作项ID",
                "candidates[].payload.workItemCode", "工作项编号",
                "candidates[].payload.workItemName", "工作项标题",
                "candidates[].payload.workItemType", "工作项类型",
                "candidates[].payload.status", "工作项状态",
                "candidates[].actions[]", "可基于该工作项继续发起的建议动作",
                "metadata", "回显查询条件"
        );
    }

    private Map<String, String> agentOutputSchema() {
        return schema(
                "summary", "本次 Agent 查询摘要",
                "candidates[]", "Agent 候选列表",
                "candidates[].id", "Agent ID",
                "candidates[].title", "Agent 名称",
                "candidates[].subtitle", "Agent 类型、接入方式与状态摘要",
                "candidates[].payload.agentId", "Agent ID",
                "candidates[].payload.agentName", "Agent 名称",
                "candidates[].payload.projectId", "所属项目ID，空表示全局 Agent",
                "candidates[].payload.enabled", "是否启用",
                "metadata.projectId", "查询使用的项目ID"
        );
    }

    private Map<String, String> gitlabBindingOutputSchema() {
        return schema(
                "summary", "本次仓库绑定查询摘要",
                "candidates[]", "绑定仓库候选列表",
                "candidates[].id", "绑定ID",
                "candidates[].title", "仓库路径或仓库标识",
                "candidates[].subtitle", "所属项目与默认分支摘要",
                "candidates[].route", "GitLab 管理入口路由",
                "candidates[].payload.bindingId", "绑定ID",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.projectName", "所属项目名称",
                "candidates[].payload.gitlabProjectPath", "GitLab 仓库路径",
                "candidates[].payload.defaultTargetBranch", "默认目标分支",
                "metadata", "回显查询条件"
        );
    }

    private Map<String, String> repoScanRulesetOutputSchema() {
        return schema(
                "summary", "可用仓库扫描规则集摘要",
                "candidates[]", "规则集候选列表",
                "candidates[].title", "规则集名称",
                "candidates[].subtitle", "规则集说明",
                "candidates[].payload.rulesetCode", "规则集编码",
                "candidates[].payload.rulesetName", "规则集名称",
                "candidates[].payload.engineType", "扫描引擎类型",
                "candidates[].payload.defaultSelected", "是否默认选中"
        );
    }

    private Map<String, String> executionTaskOutputSchema() {
        return schema(
                "summary", "本次执行任务查询摘要",
                "candidates[]", "执行任务候选列表",
                "candidates[].id", "执行任务ID",
                "candidates[].title", "执行任务标题",
                "candidates[].subtitle", "执行场景与状态摘要",
                "candidates[].route", "执行任务详情入口路由",
                "candidates[].payload.executionTaskId", "执行任务ID",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.title", "执行任务标题",
                "candidates[].payload.status", "执行任务状态",
                "metadata", "回显查询条件"
        );
    }

    private Map<String, String> testPlanOutputSchema() {
        return schema(
                "summary", "本次测试计划查询摘要",
                "candidates[]", "测试计划候选列表",
                "candidates[].id", "测试计划ID",
                "candidates[].title", "测试计划名称",
                "candidates[].subtitle", "测试计划状态、所属项目与用例数摘要",
                "candidates[].route", "测试计划详情入口路由",
                "candidates[].payload.testPlanId", "测试计划ID",
                "candidates[].payload.projectId", "所属项目ID",
                "candidates[].payload.testPlanName", "测试计划名称",
                "candidates[].payload.status", "测试计划状态",
                "candidates[].payload.iterationId", "所属迭代ID",
                "metadata", "回显查询条件"
        );
    }

    private Map<String, String> documentMarkdownOutputSchema() {
        return schema(
                "summary", "本次文档转换摘要",
                "candidates[]", "转换结果候选列表，第一版固定返回一个结果",
                "candidates[].type", "固定为 DOCUMENT_MARKDOWN",
                "candidates[].id", "文档资产ID",
                "candidates[].title", "建议标题",
                "candidates[].subtitle", "源格式与截断摘要",
                "candidates[].payload.assetId", "文档资产ID",
                "candidates[].payload.fileName", "原始文件名",
                "candidates[].payload.sourceFormat", "源文件格式",
                "candidates[].payload.markdown", "转换后的 Markdown 文本",
                "candidates[].payload.truncated", "是否发生截断",
                "candidates[].payload.warnings", "转换警告列表",
                "metadata", "回显转换场景与最大字符数"
        );
    }

    /**
     * 写工具当前统一返回“待确认动作卡片”，而不是直接落库后的实体详情。
     */
    private Map<String, String> pendingActionOutputSchema(String actionType, String titleMeaning, String paramsMeaning) {
        return schema(
                "type", "待确认动作类型，当前工具对应值通常为 " + actionType,
                "title", titleMeaning,
                "description", "给前端确认卡片展示的动作说明",
                "requiresConfirm", "是否需要用户确认后再真正执行",
                "params", paramsMeaning
        );
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
