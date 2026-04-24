package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.SelfUpgradeCenterConfigEntity;
import com.aiclub.platform.domain.model.SelfUpgradeEnvironmentProfileEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolRunEntity;
import com.aiclub.platform.domain.model.SelfUpgradePatrolTargetEntity;
import com.aiclub.platform.domain.model.SelfUpgradeWorkItemEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.repository.SelfUpgradePatrolRunRepository;
import com.aiclub.platform.repository.SelfUpgradeWorkItemRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 自升级中心与执行中心之间的桥接服务。
 * 前台仍只暴露自升级中心业务对象，后台通过内部执行任务 sourceType/sourceId 与 carrier project 复用执行链路。
 */
@Service
@Transactional
public class SelfUpgradeExecutionBridgeService {

    private static final DateTimeFormatter TITLE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String TRIGGER_SOURCE = "SELF_UPGRADE_CENTER";
    private static final String SOURCE_TYPE_PATROL_RUN = "SELF_UPGRADE_PATROL_RUN";
    private static final String SOURCE_TYPE_WORK_ITEM = "SELF_UPGRADE_WORK_ITEM";

    private final SelfUpgradeConfigService selfUpgradeConfigService;
    private final SelfUpgradePatrolPlanService patrolPlanService;
    private final SelfUpgradePatrolRunService patrolRunService;
    private final SelfUpgradePatrolRunRepository patrolRunRepository;
    private final SelfUpgradeWorkItemRepository workItemRepository;
    private final ExecutionTaskService executionTaskService;
    private final ModelConfigService modelConfigService;
    private final TokenCipherService tokenCipherService;
    private final ObjectMapper objectMapper;

    public SelfUpgradeExecutionBridgeService(SelfUpgradeConfigService selfUpgradeConfigService,
                                             SelfUpgradePatrolPlanService patrolPlanService,
                                             SelfUpgradePatrolRunService patrolRunService,
                                             SelfUpgradePatrolRunRepository patrolRunRepository,
                                             SelfUpgradeWorkItemRepository workItemRepository,
                                             ExecutionTaskService executionTaskService,
                                             ModelConfigService modelConfigService,
                                             TokenCipherService tokenCipherService,
                                             ObjectMapper objectMapper) {
        this.selfUpgradeConfigService = selfUpgradeConfigService;
        this.patrolPlanService = patrolPlanService;
        this.patrolRunService = patrolRunService;
        this.patrolRunRepository = patrolRunRepository;
        this.workItemRepository = workItemRepository;
        this.executionTaskService = executionTaskService;
        this.modelConfigService = modelConfigService;
        this.tokenCipherService = tokenCipherService;
        this.objectMapper = objectMapper;
    }

    public SelfUpgradePatrolRunEntity startPatrolRun(Long planId, UserEntity actor, String triggerMode) {
        SelfUpgradeCenterConfigEntity config = selfUpgradeConfigService.requireCenterConfig();
        if (config.getCarrierProject() == null) {
            throw new IllegalArgumentException("请先在中心配置中配置内部载体项目");
        }
        SelfUpgradePatrolPlanEntity plan = patrolPlanService.requirePlan(planId);
        if (plan.getAiModelConfig() == null) {
            throw new IllegalArgumentException("当前巡检计划尚未绑定模型配置");
        }
        List<SelfUpgradePatrolTargetEntity> enabledTargets = patrolPlanService.listTargets(planId).stream()
                .filter(SelfUpgradePatrolTargetEntity::isEnabled)
                .toList();
        if (enabledTargets.isEmpty()) {
            throw new IllegalArgumentException("当前巡检计划缺少可执行目标");
        }

        SelfUpgradePatrolRunEntity run = patrolRunService.createPendingRun(plan, triggerMode, actor);
        patrolRunService.initializeRunTargets(run, enabledTargets);
        if ("SCHEDULED".equalsIgnoreCase(triggerMode)) {
            patrolPlanService.markScheduled(planId, LocalDateTime.now());
        }
        try {
            ExecutionTaskEntity executionTask = executionTaskService.createInternalExecutionTask(new ExecutionTaskService.InternalCreateExecutionTaskCommand(
                    ExecutionWorkflowService.SCENARIO_SELF_UPGRADE_PATROL,
                    config.getCarrierProject().getId(),
                    null,
                    buildPatrolTaskTitle(plan),
                    TRIGGER_SOURCE,
                    SOURCE_TYPE_PATROL_RUN,
                    run.getId(),
                    actor == null ? null : actor.getId(),
                    false,
                    List.<ExecutionAgentBindingRequest>of(),
                    readPayloadMap(buildPatrolPayloadJson(plan, enabledTargets))
            ));
            run.setLinkedExecutionTask(executionTask);
            run.setSummary("巡检任务已创建，等待执行中心调度");
            return patrolRunRepository.save(run);
        } catch (RuntimeException exception) {
            run.setStatus("FAILED");
            run.setFinishedAt(LocalDateTime.now());
            run.setSummary(limit(exception.getMessage(), 1000));
            patrolRunRepository.save(run);
            patrolPlanService.markLastRun(planId, "FAILED", exception.getMessage(), LocalDateTime.now());
            throw exception;
        }
    }

    public SelfUpgradeWorkItemEntity startWorkItemExecution(SelfUpgradeWorkItemEntity workItem, UserEntity actor) {
        if (workItem == null) {
            throw new IllegalArgumentException("工作项不存在");
        }
        SelfUpgradeCenterConfigEntity config = selfUpgradeConfigService.requireCenterConfig();
        if (config.getCarrierProject() == null) {
            throw new IllegalArgumentException("请先在中心配置中配置内部载体项目");
        }
        if (config.getDevelopmentPlanAgent() == null
                || config.getDevelopmentImplementAgent() == null
                || config.getDevelopmentTestAgent() == null
                || config.getDevelopmentReportAgent() == null) {
            throw new IllegalArgumentException("请先在中心配置中配置完整的整改执行 Agent");
        }
        ExecutionTaskEntity executionTask = executionTaskService.createInternalExecutionTask(new ExecutionTaskService.InternalCreateExecutionTaskCommand(
                ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION,
                config.getCarrierProject().getId(),
                null,
                buildWorkItemTaskTitle(workItem),
                TRIGGER_SOURCE,
                SOURCE_TYPE_WORK_ITEM,
                workItem.getId(),
                actor == null ? null : actor.getId(),
                true,
                List.of(
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_PLAN, config.getDevelopmentPlanAgent().getId()),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_IMPLEMENT, config.getDevelopmentImplementAgent().getId()),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_TEST, config.getDevelopmentTestAgent().getId()),
                        new ExecutionAgentBindingRequest(ExecutionWorkflowService.STEP_REPORT, config.getDevelopmentReportAgent().getId())
                ),
                readPayloadMap(buildWorkItemPayloadJson(workItem))
        ));
        workItem.setLatestExecutionTask(executionTask);
        workItem.setStatus("RUNNING");
        return workItemRepository.save(workItem);
    }

    private String buildPatrolTaskTitle(SelfUpgradePatrolPlanEntity plan) {
        return "自升级巡检 · " + plan.getName() + " · " + TITLE_TIME_FORMATTER.format(LocalDateTime.now());
    }

    private String buildWorkItemTaskTitle(SelfUpgradeWorkItemEntity workItem) {
        return "自升级整改 · " + workItem.getTitle() + " · " + TITLE_TIME_FORMATTER.format(LocalDateTime.now());
    }

    private String buildPatrolPayloadJson(SelfUpgradePatrolPlanEntity plan,
                                          List<SelfUpgradePatrolTargetEntity> targets) {
        SelfUpgradeEnvironmentProfileEntity environmentProfile = plan.getEnvironmentProfile();
        ModelConfigService.ResolvedModelConfig modelConfig = modelConfigService.resolveModelConfig(plan.getAiModelConfig().getId());
        ObjectNode root = objectMapper.createObjectNode();
        root.put("inputText", buildPatrolInputText(plan, environmentProfile, modelConfig, targets));
        ObjectNode environmentNode = root.putObject("environmentProfile");
        environmentNode.put("id", environmentProfile.getId());
        environmentNode.put("code", defaultString(environmentProfile.getCode()));
        environmentNode.put("name", defaultString(environmentProfile.getName()));
        environmentNode.put("baseUrl", defaultString(environmentProfile.getBaseUrl()));
        environmentNode.set("allowedHostPatterns", readTreeOrArray(environmentProfile.getAllowedHostPatternsJson()));
        environmentNode.set("loginScript", readTreeOrArray(environmentProfile.getLoginScriptJson()));
        environmentNode.put("sandboxUsername", defaultString(environmentProfile.getSandboxUsername()));
        environmentNode.put("sandboxPassword", decrypt(environmentProfile.getSandboxPasswordCiphertext()));
        environmentNode.put("sessionStateJson", decrypt(environmentProfile.getSessionStateCiphertext()));
        environmentNode.set("writeAllowlist", readTreeOrArray(environmentProfile.getWriteAllowlistJson()));

        ObjectNode modelNode = root.putObject("modelConfig");
        modelNode.put("id", modelConfig.id());
        modelNode.put("name", defaultString(modelConfig.name()));
        modelNode.put("provider", defaultString(modelConfig.provider()));
        modelNode.put("apiBaseUrl", defaultString(modelConfig.apiBaseUrl()));
        modelNode.put("modelName", defaultString(modelConfig.modelName()));
        modelNode.put("apiKey", defaultString(modelConfig.apiKey()));

        root.put("maxExplorationSteps", plan.getMaxExplorationSteps());
        root.put("targetTimeoutSeconds", plan.getTargetTimeoutSeconds());
        root.put("runTimeoutSeconds", plan.getRunTimeoutSeconds());

        ArrayNode targetsNode = root.putArray("targets");
        for (SelfUpgradePatrolTargetEntity target : targets) {
            ObjectNode targetNode = targetsNode.addObject();
            targetNode.put("targetId", target.getId());
            targetNode.put("name", defaultString(target.getName()));
            targetNode.put("seedUrl", defaultString(target.getSeedUrl()));
            targetNode.put("goalPrompt", defaultString(target.getGoalPrompt()));
            targetNode.put("readySelector", defaultString(target.getReadySelector()));
            targetNode.put("allowWrite", target.isAllowWrite());
            targetNode.put("maxStepsOverride", target.getMaxStepsOverride() == null ? plan.getMaxExplorationSteps() : target.getMaxStepsOverride());
            targetNode.set("writeAllowlistOverride", readTreeOrArray(target.getWriteAllowlistOverrideJson()));
        }
        return root.toString();
    }

    /**
     * PATROL 实际载荷内会包含登录态、白名单和模型密钥，因此给执行中心展示层单独提供一份脱敏摘要，
     * 避免 buildStepInput 回退打印整份 JSON 时把敏感字段暴露到页面和通知里。
     */
    private String buildPatrolInputText(SelfUpgradePatrolPlanEntity plan,
                                        SelfUpgradeEnvironmentProfileEntity environmentProfile,
                                        ModelConfigService.ResolvedModelConfig modelConfig,
                                        List<SelfUpgradePatrolTargetEntity> targets) {
        StringBuilder builder = new StringBuilder();
        builder.append("请执行自升级巡检。\n")
                .append("计划名称：").append(defaultString(plan.getName())).append('\n')
                .append("环境：").append(defaultString(environmentProfile.getName())).append(" (")
                .append(defaultString(environmentProfile.getCode())).append(")\n")
                .append("巡检模型：").append(defaultString(modelConfig.name())).append(" / ")
                .append(defaultString(modelConfig.provider())).append(" / ")
                .append(defaultString(modelConfig.modelName())).append('\n')
                .append("目标数量：").append(targets.size()).append("\n\n")
                .append("目标列表：\n");
        for (SelfUpgradePatrolTargetEntity target : targets) {
            builder.append("- ").append(defaultString(target.getName()))
                    .append(" -> ").append(defaultString(target.getSeedUrl()))
                    .append('\n');
        }
        return builder.toString().trim();
    }

    private String buildWorkItemPayloadJson(SelfUpgradeWorkItemEntity workItem) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("inputText", defaultString(workItem.getExecutionPrompt()));
        payload.put("planConfirmationRequired", true);
        payload.set("repositories", readTreeOrArray(workItem.getRepositoryBindingsJson()));
        return payload.toString();
    }

    private com.fasterxml.jackson.databind.JsonNode readTreeOrArray(String json) {
        try {
            return objectMapper.readTree(defaultString(json).isBlank() ? "[]" : json);
        } catch (Exception exception) {
            throw new IllegalArgumentException("自升级配置中的 JSON 字段格式不正确", exception);
        }
    }

    private String decrypt(String ciphertext) {
        if (ciphertext == null || ciphertext.isBlank()) {
            return "";
        }
        try {
            return tokenCipherService.decrypt(ciphertext);
        } catch (Exception ignored) {
            return "";
        }
    }

    private Map<String, Object> readPayloadMap(String json) {
        try {
            return objectMapper.readValue(defaultString(json), new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception exception) {
            throw new IllegalArgumentException("自升级执行载荷格式不正确", exception);
        }
    }

    private String limit(String value, int maxLength) {
        String normalized = defaultString(value);
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
