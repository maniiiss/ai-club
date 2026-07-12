package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionRunEntity;
import com.aiclub.platform.domain.model.ExecutionStepEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.dto.RequirementAiImageRef;
import com.aiclub.platform.dto.RequirementAiPreparedContext;
import com.aiclub.platform.dto.RequirementAiTaskSnapshot;
import com.aiclub.platform.dto.TaskRequirementAiResult;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import com.aiclub.platform.repository.ExecutionRunRepository;
import com.aiclub.platform.repository.ExecutionStepRepository;
import com.aiclub.platform.repository.ExecutionTaskRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 需求 AI 执行中心专用执行器。
 * 三个步骤只生成不可变产物，用户后续编辑和回写由独立应用服务处理。
 */
@Service
public class RequirementAiExecutionService {

    public static final String ARTIFACT_REQUIREMENT_CONTEXT = "REQUIREMENT_CONTEXT";
    public static final String ARTIFACT_IMAGE_ANALYSIS = "IMAGE_ANALYSIS";
    public static final String ARTIFACT_REQUIREMENT_AI_RESULT = "REQUIREMENT_AI_RESULT";
    private static final int VISION_BATCH_SIZE = 4;

    private final RequirementAiContextService requirementAiContextService;
    private final TaskRequirementAiService taskRequirementAiService;
    private final AgentExecutionService agentExecutionService;
    private final DocumentAssetService documentAssetService;
    private final ExecutionStepRepository executionStepRepository;
    private final ExecutionRunRepository executionRunRepository;
    private final ExecutionArtifactRepository executionArtifactRepository;
    private final ExecutionTaskRepository executionTaskRepository;
    private final ExecutionEventService executionEventService;
    private final ObjectMapper objectMapper;

    public RequirementAiExecutionService(RequirementAiContextService requirementAiContextService,
                                         TaskRequirementAiService taskRequirementAiService,
                                         AgentExecutionService agentExecutionService,
                                         DocumentAssetService documentAssetService,
                                         ExecutionStepRepository executionStepRepository,
                                         ExecutionRunRepository executionRunRepository,
                                         ExecutionArtifactRepository executionArtifactRepository,
                                         ExecutionTaskRepository executionTaskRepository,
                                         ExecutionEventService executionEventService,
                                         ObjectMapper objectMapper) {
        this.requirementAiContextService = requirementAiContextService;
        this.taskRequirementAiService = taskRequirementAiService;
        this.agentExecutionService = agentExecutionService;
        this.documentAssetService = documentAssetService;
        this.executionStepRepository = executionStepRepository;
        this.executionRunRepository = executionRunRepository;
        this.executionArtifactRepository = executionArtifactRepository;
        this.executionTaskRepository = executionTaskRepository;
        this.executionEventService = executionEventService;
        this.objectMapper = objectMapper;
    }

    public RequirementAiExecutionResult executeRequirementAiTask(ExecutionTaskEntity task,
                                                                  ExecutionRunEntity run,
                                                                  ExecutionWorkflowService.WorkflowPlan workflowPlan) {
        if (workflowPlan.steps().size() != 3) {
            throw new IllegalStateException("需求 AI 工作流必须包含上下文准备、图片理解、需求生成三个步骤");
        }
        ExecutionPayload payload = readPayload(task.getInputPayload());
        List<ExecutionArtifactEntity> artifacts = new ArrayList<>();
        RequirementAiPreparedContext context = null;
        String imageAnalysis = "";

        for (ExecutionWorkflowService.ExecutionStepPlan plan : workflowPlan.steps()) {
            if (isCancelRequested(task.getId())) {
                return new RequirementAiExecutionResult("需求 AI 分析已取消，已保留现有产物。", artifacts, true);
            }
            ExecutionStepEntity step = beginStep(task, run, plan, workflowPlan.steps().size());
            try {
                switch (plan.stepCode()) {
                    case ExecutionWorkflowService.STEP_CONTEXT_PREPARE -> {
                        context = requirementAiContextService.prepare(payload.taskSnapshot());
                        String content = toJson(context);
                        completeStep(task, run, step, plan, "上下文准备完成", workflowPlan.steps().size());
                        artifacts.add(saveArtifact(task, run, step, ARTIFACT_REQUIREMENT_CONTEXT, "需求上下文", content));
                    }
                    case ExecutionWorkflowService.STEP_VISION_ANALYZE -> {
                        if (context == null) throw new IllegalStateException("需求上下文尚未准备");
                        VisionResult vision = analyzeImages(context);
                        imageAnalysis = vision.markdown();
                        if (vision.skipped()) {
                            skipStep(task, run, step, plan, vision.message(), workflowPlan.steps().size());
                        } else {
                            completeStep(task, run, step, plan, vision.message(), workflowPlan.steps().size());
                        }
                        artifacts.add(saveArtifact(task, run, step, ARTIFACT_IMAGE_ANALYSIS, "图片理解结果", toJson(vision)));
                    }
                    case ExecutionWorkflowService.STEP_REQUIREMENT_GENERATE -> {
                        if (context == null) throw new IllegalStateException("需求上下文尚未准备");
                        RequirementAiPreparedContext finalContext = appendImageAnalysis(context, imageAnalysis);
                        TaskRequirementAiResult result = taskRequirementAiService.generatePrepared(
                                task.getWorkItem(), payload.action(), payload.modelConfigId(), finalContext);
                        completeStep(task, run, step, plan, result.title() + "已生成", workflowPlan.steps().size());
                        artifacts.add(saveArtifact(task, run, step, ARTIFACT_REQUIREMENT_AI_RESULT, result.title(), toJson(result)));
                        String summary = result.title() + "已完成，可返回需求 AI 助手继续编辑和回写。";
                        run.setOutputSummary(summary);
                        run.setUpdatedAt(LocalDateTime.now());
                        executionRunRepository.save(run);
                        return new RequirementAiExecutionResult(summary, artifacts, false);
                    }
                    default -> throw new IllegalArgumentException("未知需求 AI 步骤：" + plan.stepCode());
                }
            } catch (RuntimeException exception) {
                failStep(task, run, step, exception);
                throw new RequirementAiExecutionException(step, artifacts, exception);
            }
        }
        throw new IllegalStateException("需求 AI 工作流未生成最终结果");
    }

    private VisionResult analyzeImages(RequirementAiPreparedContext context) {
        if (context.images().isEmpty()) {
            return new VisionResult(true, "没有可分析的平台图片，已跳过图片理解", "", List.of());
        }
        AgentEntity agent = agentExecutionService.resolveImageUnderstandingAgent().orElse(null);
        if (agent == null) {
            return new VisionResult(true, "图片理解智能体未启用，已跳过图片理解", "", List.of("图片理解智能体未启用"));
        }
        List<String> warnings = new ArrayList<>();
        List<ModelConfigService.VisionImage> normalized = new ArrayList<>();
        int index = 1;
        for (RequirementAiImageRef image : context.images()) {
            try {
                DocumentAssetEntity asset = documentAssetService.requireAsset(image.assetId());
                byte[] bytes = documentAssetService.loadContent(asset).bytes();
                normalized.add(new ModelConfigService.VisionImage(
                        index++,
                        defaultString(asset.getContentType()),
                        Base64.getEncoder().encodeToString(bytes),
                        defaultString(asset.getFileName())
                ));
            } catch (RuntimeException exception) {
                warnings.add("图片“" + defaultString(image.sourceName()) + "”读取失败，已跳过");
            }
        }
        if (normalized.isEmpty()) {
            return new VisionResult(true, "平台图片读取失败，已跳过图片理解", "", warnings);
        }
        List<String> outputs = new ArrayList<>();
        for (int offset = 0; offset < normalized.size(); offset += VISION_BATCH_SIZE) {
            List<ModelConfigService.VisionImage> batch = normalized.subList(offset, Math.min(offset + VISION_BATCH_SIZE, normalized.size()));
            outputs.add(agentExecutionService.runVisionAgent(
                    agent,
                    batch,
                    "请提取这些需求图片中的界面、文字、字段、流程、状态和交互约束，并标记不确定内容。"
            ));
        }
        return new VisionResult(false, "已完成 " + normalized.size() + " 张图片理解", String.join("\n\n", outputs), warnings);
    }

    private RequirementAiPreparedContext appendImageAnalysis(RequirementAiPreparedContext context, String imageAnalysis) {
        if (defaultString(imageAnalysis).isBlank()) return context;
        return new RequirementAiPreparedContext(
                context.markdown() + "\n\n## 图片理解结果\n" + imageAnalysis.trim(),
                context.images(),
                context.stats(),
                context.warnings()
        );
    }

    private ExecutionStepEntity beginStep(ExecutionTaskEntity task,
                                          ExecutionRunEntity run,
                                          ExecutionWorkflowService.ExecutionStepPlan plan,
                                          int totalSteps) {
        ExecutionStepEntity step = new ExecutionStepEntity();
        step.setRun(run);
        step.setStepNo(plan.stepNo());
        step.setStepCode(plan.stepCode());
        step.setStepName(plan.stepName());
        step.setStatus("RUNNING");
        step.setProgressPercent(0);
        step.setLatestMessage("执行中");
        step.setInputSnapshot(task.getInputPayload());
        step.setStartedAt(LocalDateTime.now());
        step = executionStepRepository.save(step);
        run.setCurrentStepNo(plan.stepNo());
        run.setProgressPercent(Math.max((plan.stepNo() - 1) * 100 / Math.max(totalSteps, 1), 0));
        run.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(run);
        task.setLatestSummary("执行中：" + plan.stepName());
        executionTaskRepository.save(task);
        executionEventService.recordStepStarted(task, run, step, "执行中：" + plan.stepName());
        return step;
    }

    private void completeStep(ExecutionTaskEntity task,
                              ExecutionRunEntity run,
                              ExecutionStepEntity step,
                              ExecutionWorkflowService.ExecutionStepPlan plan,
                              String message,
                              int totalSteps) {
        finishStep(task, run, step, plan, "SUCCESS", message, totalSteps);
    }

    private void skipStep(ExecutionTaskEntity task,
                          ExecutionRunEntity run,
                          ExecutionStepEntity step,
                          ExecutionWorkflowService.ExecutionStepPlan plan,
                          String message,
                          int totalSteps) {
        finishStep(task, run, step, plan, "SKIPPED", message, totalSteps);
    }

    private void finishStep(ExecutionTaskEntity task,
                            ExecutionRunEntity run,
                            ExecutionStepEntity step,
                            ExecutionWorkflowService.ExecutionStepPlan plan,
                            String status,
                            String message,
                            int totalSteps) {
        step.setStatus(status);
        step.setOutputSnapshot(message);
        step.setLatestMessage(message);
        step.setProgressPercent(100);
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordSummary(task, run, step, message);
        executionEventService.recordStepFinished(task, run, step, message);
        run.setProgressPercent(plan.stepNo() * 100 / Math.max(totalSteps, 1));
        run.setOutputSummary(message);
        run.setUpdatedAt(LocalDateTime.now());
        executionRunRepository.save(run);
    }

    private void failStep(ExecutionTaskEntity task, ExecutionRunEntity run, ExecutionStepEntity step, RuntimeException exception) {
        step.setStatus("FAILED");
        step.setErrorMessage(resolveMessage(exception));
        step.setLatestMessage(step.getErrorMessage());
        step.setFinishedAt(LocalDateTime.now());
        executionStepRepository.save(step);
        executionEventService.recordStepFinished(task, run, step, step.getLatestMessage());
    }

    private ExecutionArtifactEntity saveArtifact(ExecutionTaskEntity task,
                                                  ExecutionRunEntity run,
                                                  ExecutionStepEntity step,
                                                  String artifactType,
                                                  String title,
                                                  String content) {
        ExecutionArtifactEntity artifact = new ExecutionArtifactEntity();
        artifact.setRun(run);
        artifact.setStep(step);
        artifact.setArtifactType(artifactType);
        artifact.setTitle(title);
        artifact.setContentText(content);
        artifact.setWorkItemWritebackFlag(false);
        artifact = executionArtifactRepository.save(artifact);
        executionEventService.recordArtifactReady(task, run, step, artifact.getId(), title);
        return artifact;
    }

    private ExecutionPayload readPayload(String inputPayload) {
        try {
            JsonNode root = objectMapper.readTree(defaultString(inputPayload));
            RequirementAiTaskSnapshot snapshot = objectMapper.treeToValue(root.path("taskSnapshot"), RequirementAiTaskSnapshot.class);
            return new ExecutionPayload(root.path("action").asText(""), root.path("modelConfigId").isNumber()
                    ? root.path("modelConfigId").asLong() : null, snapshot);
        } catch (Exception exception) {
            throw new IllegalArgumentException("需求 AI 执行参数格式错误", exception);
        }
    }

    private boolean isCancelRequested(Long taskId) {
        return executionTaskRepository.findById(taskId).map(ExecutionTaskEntity::isCancelRequested).orElse(false);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("需求 AI 产物序列化失败", exception);
        }
    }

    private String resolveMessage(RuntimeException exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank() ? "需求 AI 步骤执行失败" : exception.getMessage();
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private record ExecutionPayload(String action, Long modelConfigId, RequirementAiTaskSnapshot taskSnapshot) {
    }

    public record VisionResult(boolean skipped, String message, String markdown, List<String> warnings) {
        public VisionResult {
            warnings = warnings == null ? List.of() : List.copyOf(warnings);
        }
    }

    public record RequirementAiExecutionResult(String summary, List<ExecutionArtifactEntity> artifacts, boolean canceled) {
    }

    public static class RequirementAiExecutionException extends RuntimeException {
        private final ExecutionStepEntity failedStep;
        private final List<ExecutionArtifactEntity> artifacts;

        public RequirementAiExecutionException(ExecutionStepEntity failedStep,
                                               List<ExecutionArtifactEntity> artifacts,
                                               RuntimeException cause) {
            super(cause.getMessage(), cause);
            this.failedStep = failedStep;
            this.artifacts = List.copyOf(artifacts);
        }

        public ExecutionStepEntity failedStep() {
            return failedStep;
        }

        public List<ExecutionArtifactEntity> artifacts() {
            return artifacts;
        }
    }
}
