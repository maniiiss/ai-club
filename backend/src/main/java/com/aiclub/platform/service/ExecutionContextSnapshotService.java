package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionArtifactEntity;
import com.aiclub.platform.domain.model.ExecutionTaskEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.ExecutionArtifactRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 执行创建阶段的上下文快照服务。
 * 需求和技术设计正文在任务创建时固化，保证异步调度、重试和历史审计使用同一份输入。
 */
@Service
public class ExecutionContextSnapshotService {

    private final ExecutionArtifactRepository executionArtifactRepository;

    public ExecutionContextSnapshotService(ExecutionArtifactRepository executionArtifactRepository) {
        this.executionArtifactRepository = executionArtifactRepository;
    }

    public ContextSnapshot snapshot(TaskEntity workItem,
                                    String scenarioCode,
                                    boolean includeRequirementContext,
                                    boolean includeTechnicalDesignContext) {
        boolean technicalDesignScenario = ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING
                .equalsIgnoreCase(defaultString(scenarioCode));
        TaskEntity requirement = workItem == null ? null : workItem.getRequirementTask();
        if (technicalDesignScenario && requirement == null) {
            throw new IllegalArgumentException("技术设计工作项必须关联需求");
        }

        List<String> warnings = new ArrayList<>();
        boolean requirementIncluded = technicalDesignScenario || includeRequirementContext;
        if (requirement == null) {
            requirementIncluded = false;
            if (!technicalDesignScenario && includeRequirementContext) {
                warnings.add("当前工作项未关联需求，本次不会带入需求上下文");
            }
        }

        Map<String, Object> requirementContext = requirementIncluded
                ? buildRequirementContext(requirement)
                : Map.of();
        Map<String, Object> technicalDesignContext = Map.of();
        boolean technicalDesignIncluded = false;
        if (includeTechnicalDesignContext && requirement != null && !technicalDesignScenario) {
            var page = executionArtifactRepository.findLatestSuccessfulTechnicalDesignArtifact(
                    requirement.getId(), PageRequest.of(0, 1));
            if (page.hasContent()) {
                technicalDesignContext = buildTechnicalDesignContext(page.getContent().get(0));
                technicalDesignIncluded = true;
            } else {
                warnings.add("关联需求暂无可用技术设计，本次不会带入技术设计");
            }
        }

        return new ContextSnapshot(
                requirementIncluded,
                technicalDesignIncluded,
                requirementContext,
                technicalDesignContext,
                warnings
        );
    }

    public Map<String, Object> normalizePayload(TaskEntity workItem,
                                                String scenarioCode,
                                                Map<String, Object> payload) {
        boolean supportedScenario = ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION
                .equalsIgnoreCase(defaultString(scenarioCode))
                || ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING
                .equalsIgnoreCase(defaultString(scenarioCode));
        if (!supportedScenario) {
            return payload;
        }
        boolean includeRequirement = booleanValue(payload.get("includeRequirementContext"), true);
        boolean includeTechnicalDesign = booleanValue(payload.get("includeTechnicalDesignContext"), true);
        ContextSnapshot snapshot = snapshot(workItem, scenarioCode, includeRequirement, includeTechnicalDesign);
        payload.put("includeRequirementContext", snapshot.requirementIncluded());
        payload.put("includeTechnicalDesignContext", snapshot.technicalDesignIncluded());
        payload.put("requirementContext", snapshot.requirementContext());
        payload.put("technicalDesignContext", snapshot.technicalDesignContext());
        payload.put("contextWarnings", snapshot.warnings());
        return payload;
    }

    private Map<String, Object> buildRequirementContext(TaskEntity requirement) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("workItemId", requirement.getId());
        context.put("workItemCode", defaultString(requirement.getWorkItemCode()));
        context.put("name", defaultString(requirement.getName()));
        context.put("status", defaultString(requirement.getStatus()));
        context.put("priority", defaultString(requirement.getPriority()));
        context.put("description", defaultString(requirement.getDescription()));
        context.put("requirementMarkdown", defaultString(requirement.getRequirementMarkdown()));
        context.put("prototypeUrl", defaultString(requirement.getPrototypeUrl()));
        if (requirement.getUpdatedAt() != null) {
            context.put("updatedAt", requirement.getUpdatedAt().toString());
        }
        return context;
    }

    private Map<String, Object> buildTechnicalDesignContext(ExecutionArtifactEntity artifact) {
        Map<String, Object> context = new LinkedHashMap<>();
        ExecutionTaskEntity executionTask = artifact.getRun().getExecutionTask();
        TaskEntity designWorkItem = executionTask.getWorkItem();
        context.put("artifactId", artifact.getId());
        context.put("executionTaskId", executionTask.getId());
        context.put("workItemId", designWorkItem == null ? null : designWorkItem.getId());
        context.put("workItemCode", designWorkItem == null ? "" : defaultString(designWorkItem.getWorkItemCode()));
        context.put("workItemName", designWorkItem == null ? "" : defaultString(designWorkItem.getName()));
        context.put("title", defaultString(artifact.getTitle()));
        context.put("contentMarkdown", defaultString(artifact.getContentText()));
        if (artifact.getCreatedAt() != null) {
            context.put("createdAt", artifact.getCreatedAt().toString());
        }
        return context;
    }

    private boolean booleanValue(Object value, boolean fallback) {
        return value == null ? fallback : Boolean.parseBoolean(String.valueOf(value));
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    public record ContextSnapshot(boolean requirementIncluded,
                                  boolean technicalDesignIncluded,
                                  Map<String, Object> requirementContext,
                                  Map<String, Object> technicalDesignContext,
                                  List<String> warnings) {
    }
}
