package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.TaskAttachmentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskWorkItemRelationEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.RequirementAiImageRef;
import com.aiclub.platform.dto.RequirementAiPreparedContext;
import com.aiclub.platform.dto.RequirementAiTaskSnapshot;
import com.aiclub.platform.repository.TaskAttachmentRepository;
import com.aiclub.platform.repository.TaskWorkItemRelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 需求 AI 上下文准备服务。
 * 只读取工作项已绑定的附件、平台图片和关联工作项，不抓取任意外部 URL。
 */
@Service
@Transactional(readOnly = true)
public class RequirementAiContextService {

    public static final String DOCUMENT_SCENE = "REQUIREMENT_AI_CONTEXT";
    private static final int MAX_ATTACHMENTS = 5;
    private static final int MAX_ATTACHMENT_CHARS = 8000;
    private static final int MAX_IMAGES = 8;
    private static final int MAX_LINKED_WORK_ITEMS = 10;
    private static final int MAX_LINKED_DESCRIPTION_CHARS = 500;
    /** 同时兼容当前 public-files 图片直链和历史 files 资产路径，域名与查询参数不参与识别。 */
    private static final Pattern PLATFORM_ASSET_PATTERN = Pattern.compile("/api/common/(?:public-)?files/(\\d+)");

    private final TaskAttachmentRepository taskAttachmentRepository;
    private final TaskWorkItemRelationRepository taskWorkItemRelationRepository;
    private final DocumentMarkdownService documentMarkdownService;
    private final DocumentAssetService documentAssetService;

    public RequirementAiContextService(TaskAttachmentRepository taskAttachmentRepository,
                                       TaskWorkItemRelationRepository taskWorkItemRelationRepository,
                                       DocumentMarkdownService documentMarkdownService,
                                       DocumentAssetService documentAssetService) {
        this.taskAttachmentRepository = taskAttachmentRepository;
        this.taskWorkItemRelationRepository = taskWorkItemRelationRepository;
        this.documentMarkdownService = documentMarkdownService;
        this.documentAssetService = documentAssetService;
    }

    /**
     * 从当前工作项实体创建可持久化文本快照，后台执行后续只使用快照中的主工作项字段。
     */
    public RequirementAiTaskSnapshot snapshot(TaskEntity task, String action) {
        TaskEntity requirement = task == null ? null : task.getRequirementTask();
        return new RequirementAiTaskSnapshot(
                task == null ? null : task.getId(),
                action,
                task == null ? "" : defaultString(task.getName()),
                task == null ? "" : defaultString(task.getWorkItemType()),
                task == null ? "" : defaultString(task.getTaskType()),
                task == null || task.getProject() == null ? "" : defaultString(task.getProject().getName()),
                task == null || task.getIteration() == null ? "未规划" : defaultString(task.getIteration().getName()),
                task == null ? "" : defaultString(task.getStatus()),
                task == null ? "" : defaultString(task.getPriority()),
                task == null ? "" : defaultString(task.getPrototypeUrl()),
                task == null ? "" : defaultString(task.getDescription()),
                task == null ? "" : defaultString(task.getRequirementMarkdown()),
                requirement == null ? null : defaultString(requirement.getName()),
                requirement == null ? null : defaultString(requirement.getDescription())
        );
    }

    public RequirementAiPreparedContext prepare(RequirementAiTaskSnapshot snapshot) {
        if (snapshot == null || snapshot.taskId() == null) {
            throw new IllegalArgumentException("需求 AI 工作项快照不能为空");
        }

        List<String> warnings = new ArrayList<>();
        List<RequirementAiImageRef> images = new ArrayList<>();
        Set<Long> imageAssetIds = new LinkedHashSet<>();
        StringBuilder markdown = new StringBuilder(buildBaseMarkdown(snapshot));

        int attachmentIncluded = appendAttachments(snapshot.taskId(), markdown, images, imageAssetIds, warnings);
        collectPlatformImages(snapshot.description(), images, imageAssetIds, warnings);
        collectPlatformImages(snapshot.requirementMarkdown(), images, imageAssetIds, warnings);
        collectPlatformImages(snapshot.prototypeUrl(), images, imageAssetIds, warnings);
        int linkedIncluded = appendLinkedWorkItems(snapshot.taskId(), markdown, warnings);

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("attachmentIncluded", attachmentIncluded);
        stats.put("imageIncluded", images.size());
        stats.put("linkedWorkItemIncluded", linkedIncluded);
        return new RequirementAiPreparedContext(markdown.toString().trim(), images, stats, warnings);
    }

    private int appendAttachments(Long taskId,
                                  StringBuilder markdown,
                                  List<RequirementAiImageRef> images,
                                  Set<Long> imageAssetIds,
                                  List<String> warnings) {
        List<TaskAttachmentEntity> attachments = taskAttachmentRepository.findAllByTask_IdOrderByCreatedAtAscIdAsc(taskId);
        if (attachments.size() > MAX_ATTACHMENTS) {
            warnings.add("附件最多读取 5 个，其余附件未进入本次分析");
        }
        int included = 0;
        for (TaskAttachmentEntity attachment : attachments.stream().limit(MAX_ATTACHMENTS).toList()) {
            DocumentAssetEntity asset = attachment.getDocumentAsset();
            if (asset == null) {
                continue;
            }
            included++;
            if (isImage(asset)) {
                addImage(asset, images, imageAssetIds, warnings);
                continue;
            }
            try {
                DocumentMarkdownResult converted = documentMarkdownService.convertAsset(asset, DOCUMENT_SCENE, MAX_ATTACHMENT_CHARS);
                markdown.append("\n\n## 附件：").append(defaultString(asset.getFileName())).append("\n")
                        .append(abbreviate(converted.markdown(), MAX_ATTACHMENT_CHARS));
                warnings.addAll(converted.warnings());
                if (converted.truncated() || defaultString(converted.markdown()).length() > MAX_ATTACHMENT_CHARS) {
                    warnings.add("附件“" + defaultString(asset.getFileName()) + "”内容已截断为 8000 字符");
                }
            } catch (RuntimeException exception) {
                warnings.add("附件“" + defaultString(asset.getFileName()) + "”读取失败：" + defaultString(exception.getMessage()));
            }
        }
        return included;
    }

    private int appendLinkedWorkItems(Long taskId, StringBuilder markdown, List<String> warnings) {
        Map<Long, TaskEntity> linked = new LinkedHashMap<>();
        taskWorkItemRelationRepository.findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(taskId, "CHILD")
                .forEach(relation -> putLinked(linked, relation.getTargetTask(), taskId));
        taskWorkItemRelationRepository.findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(taskId, "CHILD")
                .forEach(relation -> putLinked(linked, relation.getSourceTask(), taskId));
        taskWorkItemRelationRepository
                .findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(
                        "RELATED", taskId, "RELATED", taskId)
                .forEach(relation -> putLinked(linked, otherTask(relation, taskId), taskId));

        if (linked.size() > MAX_LINKED_WORK_ITEMS) {
            warnings.add("关联工作项最多读取 10 个，其余关联未进入本次分析");
        }
        List<TaskEntity> included = linked.values().stream().limit(MAX_LINKED_WORK_ITEMS).toList();
        if (!included.isEmpty()) {
            markdown.append("\n\n## 关联工作项");
            for (TaskEntity task : included) {
                markdown.append("\n\n- ").append(defaultString(task.getName()))
                        .append("（").append(defaultString(task.getWorkItemType())).append(" / ")
                        .append(defaultString(task.getStatus())).append(" / ")
                        .append(defaultString(task.getPriority())).append("）")
                        .append("\n  摘要：").append(abbreviate(task.getDescription(), MAX_LINKED_DESCRIPTION_CHARS));
            }
        }
        return included.size();
    }

    private void collectPlatformImages(String text,
                                       List<RequirementAiImageRef> images,
                                       Set<Long> imageAssetIds,
                                       List<String> warnings) {
        Matcher matcher = PLATFORM_ASSET_PATTERN.matcher(defaultString(text));
        while (matcher.find()) {
            if (images.size() >= MAX_IMAGES) {
                addImageLimitWarning(warnings);
                return;
            }
            Long assetId = Long.valueOf(matcher.group(1));
            if (imageAssetIds.contains(assetId)) {
                continue;
            }
            try {
                DocumentAssetEntity asset = documentAssetService.requireAsset(assetId);
                if (isImage(asset)) {
                    addImage(asset, images, imageAssetIds, warnings);
                }
            } catch (RuntimeException exception) {
                warnings.add("平台图片资产 " + assetId + " 不可用，已跳过");
            }
        }
    }

    private void addImage(DocumentAssetEntity asset,
                          List<RequirementAiImageRef> images,
                          Set<Long> imageAssetIds,
                          List<String> warnings) {
        if (asset == null || asset.getId() == null || imageAssetIds.contains(asset.getId())) {
            return;
        }
        if (images.size() >= MAX_IMAGES) {
            addImageLimitWarning(warnings);
            return;
        }
        imageAssetIds.add(asset.getId());
        images.add(new RequirementAiImageRef(asset.getId(), defaultString(asset.getContentType()), defaultString(asset.getFileName())));
    }

    private void addImageLimitWarning(List<String> warnings) {
        String warning = "图片最多读取 8 张，其余图片未进入本次分析";
        if (!warnings.contains(warning)) {
            warnings.add(warning);
        }
    }

    private String buildBaseMarkdown(RequirementAiTaskSnapshot snapshot) {
        String label = "任务".equals(defaultString(snapshot.workItemType())) ? "测试任务" : "需求";
        String requirement = snapshot.requirementTaskName() == null ? "" : """

                关联需求：%s
                关联需求描述：
                %s
                """.formatted(snapshot.requirementTaskName(), defaultString(snapshot.requirementTaskDescription()));
        return """
                %s标题：%s
                项目：%s
                所属迭代：%s
                当前状态：%s
                优先级：%s
                原型链接：%s
                当前描述：
                %s

                需求文档：
                %s%s
                """.formatted(
                label,
                defaultString(snapshot.name()),
                defaultString(snapshot.projectName()),
                defaultString(snapshot.iterationName()),
                defaultString(snapshot.status()),
                defaultString(snapshot.priority()),
                defaultString(snapshot.prototypeUrl()),
                defaultString(snapshot.description()),
                defaultString(snapshot.requirementMarkdown()),
                requirement
        ).trim();
    }

    private TaskEntity otherTask(TaskWorkItemRelationEntity relation, Long taskId) {
        if (relation.getSourceTask() != null && taskId.equals(relation.getSourceTask().getId())) {
            return relation.getTargetTask();
        }
        return relation.getSourceTask();
    }

    private void putLinked(Map<Long, TaskEntity> linked, TaskEntity task, Long currentTaskId) {
        if (task != null && task.getId() != null && !task.getId().equals(currentTaskId)) {
            linked.putIfAbsent(task.getId(), task);
        }
    }

    private boolean isImage(DocumentAssetEntity asset) {
        return defaultString(asset.getContentType()).toLowerCase().startsWith("image/");
    }

    private String abbreviate(String value, int maxChars) {
        String normalized = defaultString(value);
        return normalized.length() <= maxChars ? normalized : normalized.substring(0, maxChars);
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
