package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformToolConfigEntity;
import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.repository.PlatformToolConfigRepository;
import org.springframework.stereotype.Service;

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
    public static final String TOOL_EXECUTION_TASK_SEARCH = "execution_task.search";
    public static final String TOOL_EXECUTION_TASK_GET_DETAIL = "execution_task.get_detail";
    public static final String TOOL_EXECUTION_TASK_CREATE = "execution_task.create";
    public static final String TOOL_EXECUTION_TASK_RETRY = "execution_task.retry";
    public static final String TOOL_EXECUTION_TASK_CANCEL = "execution_task.cancel";
    public static final String TOOL_TEST_PLAN_SEARCH = "test_plan.search";
    public static final String TOOL_TEST_PLAN_GET_DETAIL = "test_plan.get_detail";
    public static final String TOOL_TEST_PLAN_CREATE_DRAFT = "test_plan.create_draft";
    public static final String TOOL_TEST_CASE_APPEND = "test_case.append";

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
                        definition.inputSchema()
                ))
                .orElse(definition);
    }

    private Map<String, PlatformToolDefinition> buildDefinitions() {
        LinkedHashMap<String, PlatformToolDefinition> result = new LinkedHashMap<>();
        register(result, TOOL_PROJECT_SEARCH, "搜索项目", "PROJECT", "按名称或状态搜索当前用户可见项目", true, "LOW", "project:view", false, Map.of("keyword", "项目关键词"));
        register(result, TOOL_PROJECT_GET_DETAIL, "项目详情", "PROJECT", "读取项目摘要与成员信息", true, "LOW", "project:view", false, Map.of("projectId", "项目ID"));
        register(result, TOOL_PROJECT_LIST_ITERATIONS, "项目迭代列表", "PROJECT", "读取项目迭代列表", true, "LOW", "project:view", false, Map.of("projectId", "项目ID"));
        register(result, TOOL_USER_RESOLVE_PROJECT_MEMBER, "解析项目成员", "USER", "按昵称或用户名解析项目成员", true, "LOW", "project:view", false, Map.of("projectId", "项目ID", "keyword", "成员关键词"));
        register(result, TOOL_USER_LIST_PROJECT_MEMBERS, "项目成员列表", "USER", "列出项目负责人、创建人和成员", true, "LOW", "project:view", false, Map.of("projectId", "项目ID"));
        register(result, TOOL_WORK_ITEM_SEARCH, "搜索工作项", "WORK_ITEM", "按标题、编号或说明搜索需求/任务/缺陷", true, "LOW", "task:view", false, Map.of("keyword", "工作项关键词", "projectId", "项目ID"));
        register(result, TOOL_WORK_ITEM_GET_DETAIL, "工作项详情", "WORK_ITEM", "读取工作项详情和评论摘要", true, "LOW", "task:view", false, Map.of("workItemId", "工作项ID"));
        register(result, TOOL_WORK_ITEM_CREATE_DRAFT, "创建工作项草稿", "WORK_ITEM", "创建需求/任务/缺陷草稿", false, "MEDIUM", "task:manage", true, Map.of("projectId", "项目ID", "name", "标题", "content", "内容"));
        register(result, TOOL_WORK_ITEM_ASSIGN, "指派工作项", "WORK_ITEM", "修改工作项负责人或协作人", false, "MEDIUM", "task:manage", true, Map.of("workItemId", "工作项ID", "assigneeUserId", "负责人ID"));
        register(result, TOOL_AGENT_LIST_AVAILABLE, "可用 Agent 列表", "AGENT", "查询全局和项目可用 Agent", true, "LOW", "agent:view", false, Map.of("projectId", "项目ID"));
        register(result, TOOL_AGENT_GET_DETAIL, "Agent 详情", "AGENT", "读取 Agent 类型、接入方式和能力", true, "LOW", "agent:view", false, Map.of("agentId", "Agent ID"));
        register(result, TOOL_EXECUTION_TASK_SEARCH, "搜索执行任务", "EXECUTION", "按项目、工作项、状态或场景搜索执行任务", true, "LOW", "task:view", false, Map.of("keyword", "执行任务关键词"));
        register(result, TOOL_EXECUTION_TASK_GET_DETAIL, "执行任务详情", "EXECUTION", "读取执行任务、运行、步骤和产物", true, "LOW", "task:view", false, Map.of("executionTaskId", "执行任务ID"));
        register(result, TOOL_EXECUTION_TASK_CREATE, "创建执行任务", "EXECUTION", "基于工作项创建执行中心任务", false, "MEDIUM", "task:execution:create", true, Map.of("workItemId", "工作项ID", "scenarioCode", "执行场景"));
        register(result, TOOL_EXECUTION_TASK_RETRY, "重试执行任务", "EXECUTION", "重试执行中心任务", false, "MEDIUM", "task:execution:retry", true, Map.of("executionTaskId", "执行任务ID"));
        register(result, TOOL_EXECUTION_TASK_CANCEL, "取消执行任务", "EXECUTION", "取消执行中心任务", false, "MEDIUM", "task:execution:cancel", true, Map.of("executionTaskId", "执行任务ID"));
        register(result, TOOL_TEST_PLAN_SEARCH, "搜索测试计划", "TEST", "按项目、迭代、状态或关键词查询测试计划", true, "LOW", "test:view", false, Map.of("keyword", "测试计划关键词"));
        register(result, TOOL_TEST_PLAN_GET_DETAIL, "测试计划详情", "TEST", "读取测试计划和测试用例", true, "LOW", "test:view", false, Map.of("testPlanId", "测试计划ID"));
        register(result, TOOL_TEST_PLAN_CREATE_DRAFT, "创建测试计划草稿", "TEST", "创建测试计划草稿", false, "MEDIUM", "test:manage", true, Map.of("projectId", "项目ID", "iterationId", "迭代ID", "name", "名称"));
        register(result, TOOL_TEST_CASE_APPEND, "追加测试用例", "TEST", "向测试计划追加测试用例", false, "MEDIUM", "test:manage", true, Map.of("testPlanId", "测试计划ID", "cases", "测试用例"));
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
                          Map<String, String> inputSchema) {
        result.put(code, new PlatformToolDefinition(code, name, moduleCode, description, readOnly, riskLevel, permissionCode, requiresConfirm, inputSchema));
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
