package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.repository.AgentRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

/**
 * 执行工作流服务。
 * 第一版仅支持平台内置的模板化顺序流，不开放用户自定义流程编辑。
 */
@Service
public class ExecutionWorkflowService {

    public static final String SCENARIO_REQUIREMENT_BREAKDOWN = "REQUIREMENT_BREAKDOWN";
    public static final String SCENARIO_DEVELOPMENT_IMPLEMENTATION = "DEVELOPMENT_IMPLEMENTATION";
    public static final String SCENARIO_TEST_DESIGN_OR_REVIEW = "TEST_DESIGN_OR_REVIEW";
    public static final String SCENARIO_AD_HOC_AGENT_RUN = "AD_HOC_AGENT_RUN";
    public static final String SCENARIO_CODEBASE_COMPLIANCE_SCAN = "CODEBASE_COMPLIANCE_SCAN";

    public static final String STEP_PLAN = "PLAN";
    public static final String STEP_REPO_STRUCTURING = "REPO_STRUCTURING";
    public static final String STEP_IMPLEMENT = "IMPLEMENT";
    public static final String STEP_TEST = "TEST";
    public static final String STEP_TEST_DESIGN = "TEST_DESIGN";
    public static final String STEP_REPORT = "REPORT";
    public static final String STEP_REVIEW = "REVIEW";
    public static final String STEP_AD_HOC_RUN = "AD_HOC_RUN";

    private static final Set<String> SUPPORTED_SCENARIOS = Set.of(
            SCENARIO_REQUIREMENT_BREAKDOWN,
            SCENARIO_DEVELOPMENT_IMPLEMENTATION,
            SCENARIO_TEST_DESIGN_OR_REVIEW,
            SCENARIO_AD_HOC_AGENT_RUN,
            SCENARIO_CODEBASE_COMPLIANCE_SCAN
    );

    private final AgentRepository agentRepository;
    private final ObjectMapper objectMapper;

    public ExecutionWorkflowService(AgentRepository agentRepository,
                                    ObjectMapper objectMapper) {
        this.agentRepository = agentRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 根据场景编码与用户输入绑定生成可执行的步骤计划，并在创建时固化每一步的 Agent。
     */
    public WorkflowPlan buildWorkflow(String scenarioCode,
                                      Long projectId,
                                      List<ExecutionAgentBindingRequest> requestedBindings) {
        return buildWorkflow(scenarioCode, projectId, requestedBindings, List.of());
    }

    /**
     * 根据场景与仓库列表生成执行步骤；开发执行场景支持多仓动态展开。
     */
    public WorkflowPlan buildWorkflow(String scenarioCode,
                                      Long projectId,
                                      List<ExecutionAgentBindingRequest> requestedBindings,
                                      List<DevelopmentRepositorySelection> developmentRepositories) {
        String normalizedScenarioCode = normalizeScenarioCode(scenarioCode);
        Map<String, Long> requestedBindingMap = toBindingMap(requestedBindings);
        List<AgentEntity> availableAgents = listAvailableAgents(projectId);
        List<StepTemplate> templates = SCENARIO_DEVELOPMENT_IMPLEMENTATION.equals(normalizedScenarioCode)
                && developmentRepositories != null
                && !developmentRepositories.isEmpty()
                ? buildDevelopmentTemplates(developmentRepositories)
                : buildTemplates(normalizedScenarioCode);
        List<ExecutionStepPlan> steps = new ArrayList<>();

        for (int index = 0; index < templates.size(); index++) {
            StepTemplate template = templates.get(index);
            AgentEntity agent = resolveStepAgent(template, requestedBindingMap.get(template.stepCode()), availableAgents);
            steps.add(new ExecutionStepPlan(
                    index + 1,
                    template.stepCode(),
                    template.stepName(),
                    agent,
                    template.repositoryBindingId(),
                    template.repositoryTargetBranch(),
                    template.repositoryDisplayName()
            ));
        }

        return new WorkflowPlan(normalizedScenarioCode, scenarioName(normalizedScenarioCode), steps);
    }

    /**
     * 根据任务中固化的 Agent 绑定快照恢复步骤计划，供调度执行与重试复用。
     */
    public WorkflowPlan restoreWorkflow(String scenarioCode,
                                        Long projectId,
                                        String storedBindingPayload) {
        String normalizedScenarioCode = normalizeScenarioCode(scenarioCode);
        List<StoredAgentBinding> bindings = readStoredBindings(storedBindingPayload);
        List<AgentEntity> availableAgents = listAvailableAgents(projectId);
        if (shouldRestoreConcreteBindings(bindings)) {
            List<StoredAgentBinding> sortedBindings = new ArrayList<>(bindings);
            sortedBindings.sort(Comparator.comparing(binding -> binding.stepNo() == null ? Integer.MAX_VALUE : binding.stepNo()));
            List<ExecutionStepPlan> steps = new ArrayList<>();
            for (int index = 0; index < sortedBindings.size(); index++) {
                StoredAgentBinding binding = sortedBindings.get(index);
                AgentEntity agent = resolveStoredAgent(binding, availableAgents);
                steps.add(new ExecutionStepPlan(
                        binding.stepNo() == null ? index + 1 : binding.stepNo(),
                        defaultString(binding.stepCode()),
                        hasText(binding.stepName()) ? binding.stepName().trim() : defaultString(binding.stepCode()),
                        agent,
                        binding.repositoryBindingId(),
                        trimToNull(binding.repositoryTargetBranch()),
                        trimToNull(binding.repositoryDisplayName())
                ));
            }
            return new WorkflowPlan(normalizedScenarioCode, scenarioName(normalizedScenarioCode), steps);
        }

        Map<String, Long> bindingMap = new LinkedHashMap<>();
        bindings.forEach(binding -> bindingMap.put(defaultString(binding.stepCode()).trim().toUpperCase(Locale.ROOT), binding.agentId()));
        List<StepTemplate> templates = buildTemplates(normalizedScenarioCode);
        List<ExecutionStepPlan> steps = new ArrayList<>();

        for (int index = 0; index < templates.size(); index++) {
            StepTemplate template = templates.get(index);
            AgentEntity agent = resolveStepAgent(template, bindingMap.get(template.stepCode()), availableAgents);
            steps.add(new ExecutionStepPlan(
                    index + 1,
                    template.stepCode(),
                    template.stepName(),
                    agent,
                    template.repositoryBindingId(),
                    template.repositoryTargetBranch(),
                    template.repositoryDisplayName()
            ));
        }

        return new WorkflowPlan(normalizedScenarioCode, scenarioName(normalizedScenarioCode), steps);
    }

    /**
     * 将已解析好的步骤绑定固化为 JSON 文本，避免重试时再次做不确定的 Agent 自动匹配。
     */
    public String serializeBindings(WorkflowPlan workflowPlan) {
        List<StoredAgentBinding> bindings = workflowPlan.steps().stream()
                .map(step -> new StoredAgentBinding(
                        step.stepNo(),
                        step.stepCode(),
                        step.stepName(),
                        step.agent() == null ? null : step.agent().getId(),
                        step.repositoryBindingId(),
                        step.repositoryTargetBranch(),
                        step.repositoryDisplayName()
                ))
                .toList();
        try {
            return objectMapper.writeValueAsString(bindings);
        } catch (Exception exception) {
            throw new IllegalStateException("执行任务 Agent 绑定快照序列化失败", exception);
        }
    }

    /**
     * 为当前步骤构造统一输入文本，便于不同接入方式的 Agent 使用一致上下文执行。
     */
    public String buildStepInput(ExecutionTaskEntity executionTask,
                                 TaskEntity workItem,
                                 ExecutionRunEntity executionRun,
                                 ExecutionStepPlan currentStep,
                                 List<ExecutionStepEntity> previousSteps) {
        StringBuilder builder = new StringBuilder();
        builder.append("执行任务：").append(defaultString(executionTask.getTitle())).append('\n')
                .append("场景：").append(scenarioName(executionTask.getScenarioCode())).append('\n')
                .append("步骤：").append(defaultString(currentStep.stepName())).append('\n')
                .append("运行序号：").append(executionRun.getRunNo()).append("\n\n");

        if (workItem != null) {
            builder.append("## 工作项上下文\n")
                    .append("标题：").append(defaultString(workItem.getName())).append('\n')
                    .append("编号：").append(defaultString(workItem.getWorkItemCode())).append('\n')
                    .append("类型：").append(defaultString(workItem.getWorkItemType())).append('\n')
                    .append("状态：").append(defaultString(workItem.getStatus())).append('\n')
                    .append("优先级：").append(defaultString(workItem.getPriority())).append('\n')
                    .append("负责人：").append(defaultString(workItem.getAssignee())).append('\n')
                    .append("说明：").append(defaultString(workItem.getDescription())).append("\n\n");
        }

        if (hasText(currentStep.repositoryDisplayName()) || hasText(currentStep.repositoryTargetBranch())) {
            builder.append("## 当前仓库\n")
                    .append("仓库：").append(defaultString(currentStep.repositoryDisplayName())).append('\n')
                    .append("目标分支：").append(defaultString(currentStep.repositoryTargetBranch())).append("\n\n");
        }

        String inputText = extractPrimaryInputText(executionTask.getInputPayload());
        if (!inputText.isBlank()) {
            builder.append("## 补充说明\n")
                    .append(inputText)
                    .append("\n\n");
        }

        if (previousSteps != null && !previousSteps.isEmpty()) {
            builder.append("## 上一步骤输出\n");
            for (ExecutionStepEntity previousStep : previousSteps) {
                if (previousStep.getOutputSnapshot() == null || previousStep.getOutputSnapshot().isBlank()) {
                    continue;
                }
                builder.append("### ")
                        .append(defaultString(previousStep.getStepName()))
                        .append('\n')
                        .append(previousStep.getOutputSnapshot())
                        .append("\n\n");
            }
        }

        builder.append("## 当前步骤要求\n")
                .append(stepInstruction(executionTask.getScenarioCode(), currentStep.stepCode()))
                .append('\n');
        return builder.toString().trim();
    }

    public String scenarioName(String scenarioCode) {
        return switch (normalizeScenarioCode(scenarioCode)) {
            case SCENARIO_REQUIREMENT_BREAKDOWN -> "需求拆解";
            case SCENARIO_DEVELOPMENT_IMPLEMENTATION -> "开发执行";
            case SCENARIO_TEST_DESIGN_OR_REVIEW -> "测试设计/评审";
            case SCENARIO_AD_HOC_AGENT_RUN -> "兼容单次执行";
            case SCENARIO_CODEBASE_COMPLIANCE_SCAN -> "仓库规范扫描";
            default -> throw new IllegalArgumentException("不支持的执行场景");
        };
    }

    private String stepInstruction(String scenarioCode, String stepCode) {
        String normalizedScenarioCode = normalizeScenarioCode(scenarioCode);
        return switch (stepCode) {
            case STEP_PLAN -> SCENARIO_REQUIREMENT_BREAKDOWN.equals(normalizedScenarioCode)
                    ? "请把当前需求拆解为可执行项，并输出结构化 Markdown 方案。"
                    : "请先梳理当前工作项的执行路径、关键风险和依赖，输出结构化 Markdown 计划。";
            case STEP_REPO_STRUCTURING -> "请先准备仓库代码快照并生成结构化代码理解结果，供后续规划、开发和测试步骤复用。";
            case STEP_IMPLEMENT -> "请基于工作项上下文和上游计划，给出可执行的开发实现方案、代码改造建议或关键实现片段。";
            case STEP_TEST -> "请根据当前仓库的实现结果执行真实验证，并返回结构化 JSON 测试结果。";
            case STEP_TEST_DESIGN -> "请基于工作项上下文和现有方案，输出测试点、测试案例设计和验收建议。";
            case STEP_REPORT -> "请基于规划、开发与测试结果输出交付报告，明确结论、风险、遗留项与未覆盖验证。";
            case STEP_REVIEW -> "请从质量、风险、边界情况和可交付性角度评审前序输出，结果使用 Markdown。";
            case STEP_AD_HOC_RUN -> "请直接根据补充说明处理当前任务，结果使用 Markdown。";
            default -> "请根据当前上下文完成该步骤。";
        };
    }

    private Map<String, Long> toBindingMap(List<ExecutionAgentBindingRequest> requestedBindings) {
        Map<String, Long> bindingMap = new LinkedHashMap<>();
        if (requestedBindings == null) {
            return bindingMap;
        }
        for (ExecutionAgentBindingRequest requestedBinding : requestedBindings) {
            if (requestedBinding == null || requestedBinding.stepCode() == null) {
                continue;
            }
            bindingMap.put(requestedBinding.stepCode().trim().toUpperCase(Locale.ROOT), requestedBinding.agentId());
        }
        return bindingMap;
    }

    private List<StoredAgentBinding> readStoredBindings(String storedBindingPayload) {
        if (storedBindingPayload == null || storedBindingPayload.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(storedBindingPayload, new TypeReference<List<StoredAgentBinding>>() {
            });
        } catch (Exception exception) {
            throw new IllegalStateException("执行任务 Agent 绑定快照解析失败", exception);
        }
    }

    private boolean shouldRestoreConcreteBindings(List<StoredAgentBinding> bindings) {
        return bindings != null && bindings.stream().anyMatch(binding ->
                binding.stepNo() != null
                        || hasText(binding.stepName())
                        || binding.repositoryBindingId() != null
                        || hasText(binding.repositoryTargetBranch())
                        || hasText(binding.repositoryDisplayName())
        );
    }

    private List<StepTemplate> buildTemplates(String scenarioCode) {
        return switch (normalizeScenarioCode(scenarioCode)) {
            case SCENARIO_REQUIREMENT_BREAKDOWN -> List.of(
                    new StepTemplate(STEP_PLAN, "需求拆解", null, null, null)
            );
            case SCENARIO_DEVELOPMENT_IMPLEMENTATION -> List.of(
                    new StepTemplate(STEP_PLAN, "执行规划", null, null, null),
                    new StepTemplate(STEP_IMPLEMENT, "开发实现", null, null, null),
                    new StepTemplate(STEP_REVIEW, "质量评审", null, null, null)
            );
            case SCENARIO_TEST_DESIGN_OR_REVIEW -> List.of(
                    new StepTemplate(STEP_TEST_DESIGN, "测试设计", null, null, null),
                    new StepTemplate(STEP_REVIEW, "测试评审", null, null, null)
            );
            case SCENARIO_AD_HOC_AGENT_RUN -> List.of(
                    new StepTemplate(STEP_AD_HOC_RUN, "兼容执行", null, null, null)
            );
            case SCENARIO_CODEBASE_COMPLIANCE_SCAN -> List.of();
            default -> throw new IllegalArgumentException("不支持的执行场景");
        };
    }

    /**
     * 多仓开发执行需要把每个仓库展开成独立的实现与测试步骤，便于详情页定位失败仓库。
     */
    private List<StepTemplate> buildDevelopmentTemplates(List<DevelopmentRepositorySelection> developmentRepositories) {
        List<StepTemplate> templates = new ArrayList<>();
        templates.add(new StepTemplate(STEP_REPO_STRUCTURING, "仓库结构化", null, null, null));
        templates.add(new StepTemplate(STEP_PLAN, "执行规划", null, null, null));
        for (DevelopmentRepositorySelection repository : developmentRepositories) {
            templates.add(new StepTemplate(
                    STEP_IMPLEMENT,
                    "开发实现 · " + defaultString(repository.repositoryDisplayName()),
                    repository.bindingId(),
                    repository.targetBranch(),
                    repository.repositoryDisplayName()
            ));
            templates.add(new StepTemplate(
                    STEP_TEST,
                    "执行测试 · " + defaultString(repository.repositoryDisplayName()),
                    repository.bindingId(),
                    repository.targetBranch(),
                    repository.repositoryDisplayName()
            ));
        }
        templates.add(new StepTemplate(STEP_REPORT, "交付报告", null, null, null));
        return templates;
    }

    private AgentEntity resolveStoredAgent(StoredAgentBinding binding, List<AgentEntity> availableAgents) {
        if (binding == null) {
            return null;
        }
        if (STEP_REPO_STRUCTURING.equalsIgnoreCase(defaultString(binding.stepCode()))
                && binding.agentId() == null) {
            return null;
        }
        return availableAgents.stream()
                .filter(agent -> Objects.equals(agent.getId(), binding.agentId()))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("步骤 Agent 不存在或当前项目不可用: " + binding.agentId()));
    }

    private AgentEntity resolveStepAgent(StepTemplate template,
                                         Long explicitAgentId,
                                         List<AgentEntity> availableAgents) {
        if (STEP_REPO_STRUCTURING.equalsIgnoreCase(defaultString(template.stepCode()))) {
            return null;
        }
        if (explicitAgentId != null) {
            return availableAgents.stream()
                    .filter(agent -> Objects.equals(agent.getId(), explicitAgentId))
                    .findFirst()
                    .orElseThrow(() -> new NoSuchElementException("步骤 Agent 不存在或当前项目不可用: " + explicitAgentId));
        }

        return autoResolveAgent(template.stepCode(), availableAgents)
                .orElseThrow(() -> new IllegalArgumentException("未找到可执行步骤 “" + template.stepName() + "” 的 Agent，请手动指定"));
    }

    private java.util.Optional<AgentEntity> autoResolveAgent(String stepCode, List<AgentEntity> availableAgents) {
        List<AgentEntity> candidates = new ArrayList<>(availableAgents);
        candidates.sort(Comparator.comparing(AgentEntity::getId));

        return switch (stepCode) {
            case STEP_PLAN -> findFirstByPredicate(candidates, agent ->
                    isCliRuntime(agent, AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI)
                            || "REQUIREMENT_BREAKDOWN".equalsIgnoreCase(defaultString(agent.getBuiltinCode()))
                            || containsAny(agent, "planner", "规划", "需求"));
            case STEP_IMPLEMENT -> findFirstByPredicate(candidates, agent ->
                    isCliRuntime(agent, AgentExecutionService.RUNTIME_CODEX_CLI)
                            || isCliRuntime(agent, AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI)
                            || (isExecutableAgent(agent) && containsAny(agent, "coder", "code", "开发", "实现")));
            case STEP_TEST -> findFirstByPredicate(candidates, agent ->
                    isCliRuntime(agent, AgentExecutionService.RUNTIME_CODEX_CLI)
                            || isCliRuntime(agent, AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI)
                            || (isExecutableAgent(agent) && containsAny(agent, "test", "qa", "测试", "quality")))
                    .or(() -> findFirstByPredicate(candidates, agent ->
                            isExecutableAgent(agent)
                                    && containsAny(agent, "coder", "code", "开发", "实现")))
                    .or(() -> findFirstByPredicate(candidates, this::isExecutableAgent));
            case STEP_TEST_DESIGN -> findFirstByPredicate(candidates, agent ->
                    "TEST_SUGGESTION".equalsIgnoreCase(defaultString(agent.getBuiltinCode()))
                            || containsAny(agent, "test", "测试", "quality"));
            case STEP_REPORT -> findFirstByPredicate(candidates, agent ->
                    containsAny(agent, "report", "总结", "交付", "review", "评审"))
                    .or(() -> findFirstByPredicate(candidates, agent ->
                            "REQUIREMENT_BREAKDOWN".equalsIgnoreCase(defaultString(agent.getBuiltinCode()))
                                    || containsAny(agent, "planner", "规划", "需求")));
            case STEP_REVIEW -> findFirstByPredicate(candidates, agent ->
                    "CODE_REVIEW".equalsIgnoreCase(defaultString(agent.getBuiltinCode()))
                            || containsAny(agent, "review", "评审", "reviewer"));
            case STEP_AD_HOC_RUN -> candidates.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(candidates.get(0));
            default -> java.util.Optional.empty();
        };
    }

    private java.util.Optional<AgentEntity> findFirstByPredicate(List<AgentEntity> availableAgents,
                                                                 java.util.function.Predicate<AgentEntity> predicate) {
        return availableAgents.stream()
                .filter(predicate)
                .findFirst()
                .or(() -> availableAgents.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(availableAgents.get(0)));
    }

    private boolean isExecutableAgent(AgentEntity agent) {
        String accessType = defaultString(agent.getAccessType()).trim().toUpperCase(Locale.ROOT);
        return "HTTP_API".equals(accessType) || "AGENT_RUNTIME".equals(accessType);
    }

    private boolean isCliRuntime(AgentEntity agent, String runtimeType) {
        return agent != null
                && AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(defaultString(agent.getAccessType()))
                && runtimeType.equalsIgnoreCase(defaultString(agent.getRuntimeType()));
    }

    private boolean containsAny(AgentEntity agent, String... keywords) {
        String haystack = (
                defaultString(agent.getName()) + " "
                        + defaultString(agent.getType()) + " "
                        + defaultString(agent.getCapability())
        ).toLowerCase(Locale.ROOT);
        for (String keyword : keywords) {
            if (haystack.contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private List<AgentEntity> listAvailableAgents(Long projectId) {
        LinkedHashMap<Long, AgentEntity> result = new LinkedHashMap<>();
        agentRepository.findAllByEnabledTrueAndProjectIsNullOrderByIdAsc().forEach(agent -> result.put(agent.getId(), agent));
        if (projectId != null) {
            agentRepository.findAllByProject_IdAndEnabledTrueOrderByIdAsc(projectId).forEach(agent -> result.put(agent.getId(), agent));
        }
        return new ArrayList<>(result.values());
    }

    private String extractPrimaryInputText(String inputPayload) {
        if (inputPayload == null || inputPayload.isBlank()) {
            return "";
        }
        try {
            JsonNode root = objectMapper.readTree(inputPayload);
            if (root.hasNonNull("inputText")) {
                return root.get("inputText").asText("");
            }
            if (root.hasNonNull("note")) {
                return root.get("note").asText("");
            }
            if (root.hasNonNull("userQuestion")) {
                return root.get("userQuestion").asText("");
            }
            return root.isObject() ? objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(root) : root.asText("");
        } catch (Exception exception) {
            return inputPayload;
        }
    }

    private String normalizeScenarioCode(String scenarioCode) {
        String normalized = defaultString(scenarioCode).trim().toUpperCase(Locale.ROOT);
        if (!SUPPORTED_SCENARIOS.contains(normalized)) {
            throw new IllegalArgumentException("不支持的执行场景: " + scenarioCode);
        }
        return normalized;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (!hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private record StepTemplate(
            String stepCode,
            String stepName,
            Long repositoryBindingId,
            String repositoryTargetBranch,
            String repositoryDisplayName
    ) {
    }

    private record StoredAgentBinding(
            Integer stepNo,
            String stepCode,
            String stepName,
            Long agentId,
            Long repositoryBindingId,
            String repositoryTargetBranch,
            String repositoryDisplayName
    ) {
    }

    /**
     * 创建时由执行任务服务整理好的仓库选择信息，统一用于动态展开多仓步骤。
     */
    public record DevelopmentRepositorySelection(
            Long bindingId,
            String targetBranch,
            String repositoryDisplayName
    ) {
    }

    /**
     * 执行工作流快照。
     */
    public record WorkflowPlan(
            String scenarioCode,
            String scenarioName,
            List<ExecutionStepPlan> steps
    ) {
    }

    /**
     * 已解析好的单步执行计划。
     * 多仓开发执行会把仓库绑定、目标分支和展示名称固化到每一个实现/测试步骤里。
     */
    public record ExecutionStepPlan(
            Integer stepNo,
            String stepCode,
            String stepName,
            AgentEntity agent,
            Long repositoryBindingId,
            String repositoryTargetBranch,
            String repositoryDisplayName
    ) {
    }
}
