package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskUpdateRecordDetailEntity;
import com.aiclub.platform.domain.model.TaskUpdateRecordEntity;
import com.aiclub.platform.domain.model.TaskUpdateRecordSource;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskUpdateRecordDetailSummary;
import com.aiclub.platform.dto.TaskUpdateRecordSummary;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.TaskUpdateRecordDetailRepository;
import com.aiclub.platform.repository.TaskUpdateRecordRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 工作项更新记录服务。
 * 业务意图：集中处理字段差异、关联动作和操作者快照，保证管理端、公众端及自动流程使用同一历史口径。
 */
@Service
@Transactional(readOnly = true)
public class TaskUpdateRecordService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final Map<String, String> FIELD_NAMES = Map.ofEntries(
            Map.entry("name", "标题"),
            Map.entry("workItemType", "工作项类型"),
            Map.entry("taskType", "任务类型"),
            Map.entry("status", "状态"),
            Map.entry("priority", "优先级"),
            Map.entry("assignee", "负责人"),
            Map.entry("collaborators", "协作者"),
            Map.entry("description", "描述"),
            Map.entry("requirementMarkdown", "需求文档"),
            Map.entry("prototypeUrl", "原型链接"),
            Map.entry("moduleName", "模块"),
            Map.entry("devPassed", "开发通过"),
            Map.entry("testPassed", "测试通过"),
            Map.entry("workHours", "预估工时"),
            Map.entry("planStartDate", "计划开始日期"),
            Map.entry("planEndDate", "计划结束日期"),
            Map.entry("project", "项目"),
            Map.entry("agent", "智能体"),
            Map.entry("iteration", "迭代"),
            Map.entry("requirementTask", "关联需求")
    );

    private final TaskUpdateRecordRepository recordRepository;
    private final TaskUpdateRecordDetailRepository detailRepository;
    private final TaskRepository taskRepository;
    private final UserRepository userRepository;
    private final ProjectDataPermissionService projectDataPermissionService;

    public TaskUpdateRecordService(TaskUpdateRecordRepository recordRepository,
                                   TaskUpdateRecordDetailRepository detailRepository,
                                   TaskRepository taskRepository,
                                   UserRepository userRepository,
                                   ProjectDataPermissionService projectDataPermissionService) {
        this.recordRepository = recordRepository;
        this.detailRepository = detailRepository;
        this.taskRepository = taskRepository;
        this.userRepository = userRepository;
        this.projectDataPermissionService = projectDataPermissionService;
    }

    /** 捕获更新前的可编辑字段快照，供主数据保存后计算差异。 */
    public Map<String, FieldSnapshot> captureEditableFields(TaskEntity task) {
        Map<String, FieldSnapshot> values = new LinkedHashMap<>();
        values.put("name", field(task.getName()));
        values.put("workItemType", field(task.getWorkItemType()));
        values.put("taskType", field(task.getTaskType()));
        values.put("status", field(task.getStatus()));
        values.put("priority", field(task.getPriority()));
        values.put("assignee", field(task.getAssigneeUser() == null ? text(task.getAssignee()) : displayName(task.getAssigneeUser())));
        values.put("collaborators", field(task.getCollaborators().stream().map(this::displayName).sorted().collect(Collectors.joining("、"))));
        values.put("description", field(task.getDescription()));
        values.put("requirementMarkdown", field(task.getRequirementMarkdown()));
        values.put("prototypeUrl", field(task.getPrototypeUrl()));
        values.put("moduleName", field(task.getModuleName()));
        values.put("devPassed", field(Boolean.toString(task.isDevPassed())));
        values.put("testPassed", field(Boolean.toString(task.isTestPassed())));
        values.put("workHours", field(format(task.getWorkHours())));
        values.put("planStartDate", field(format(task.getPlanStartDate())));
        values.put("planEndDate", field(format(task.getPlanEndDate())));
        values.put("project", relation(task.getProject()));
        values.put("agent", relation(task.getAgent()));
        values.put("iteration", relation(task.getIteration()));
        values.put("requirementTask", relation(task.getRequirementTask()));
        return values;
    }

    @Transactional
    public void recordCreate(TaskEntity task, TaskUpdateRecordSource source) {
        List<DetailInput> details = captureEditableFields(task).entrySet().stream()
                .map(entry -> new DetailInput(entry.getKey(), FIELD_NAMES.get(entry.getKey()), "FIELD", "",
                        entry.getValue().value(), entry.getValue().relatedObjectId(), entry.getValue().relatedObjectName()))
                .toList();
        saveRecord(task, source, "CREATE", "创建工作项", details);
    }

    @Transactional
    public void recordChanges(TaskEntity task, Map<String, FieldSnapshot> previousValues, TaskUpdateRecordSource source) {
        Map<String, FieldSnapshot> currentValues = captureEditableFields(task);
        List<DetailInput> changes = currentValues.entrySet().stream()
                .filter(entry -> !Objects.equals(previousValues.get(entry.getKey()), entry.getValue()))
                .map(entry -> new DetailInput(entry.getKey(), FIELD_NAMES.get(entry.getKey()), "FIELD",
                        previousValues.get(entry.getKey()) == null ? "" : previousValues.get(entry.getKey()).value(),
                        entry.getValue().value(), entry.getValue().relatedObjectId(), entry.getValue().relatedObjectName()))
                .toList();
        if (changes.isEmpty()) {
            return;
        }
        String changedFields = changes.stream().map(DetailInput::fieldName).collect(Collectors.joining("、"));
        saveRecord(task, source, "UPDATE", "更新了：" + changedFields, changes);
    }

    @Transactional
    public void recordAction(TaskEntity task,
                             TaskUpdateRecordSource source,
                             String actionType,
                             String summary,
                             String fieldCode,
                             String fieldName,
                             String oldValue,
                             String newValue,
                             Long relatedObjectId,
                             String relatedObjectName) {
        saveRecord(task, source, actionType, summary, List.of(
                new DetailInput(fieldCode, fieldName, actionType, text(oldValue), text(newValue), relatedObjectId, relatedObjectName)
        ));
    }

    public PageResponse<TaskUpdateRecordSummary> pageRecords(Long taskId, int page, int size) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new java.util.NoSuchElementException("工作项不存在: " + taskId));
        projectDataPermissionService.requireTaskVisible(task);
        PageRequest pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(1, Math.min(size, 100)),
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
        // 评论属于独立协作数据，历史上遗留的 COMMENT 记录也不应进入更新记录时间线。
        Page<TaskUpdateRecordEntity> records = recordRepository.findAllByTask_IdAndActionTypeNot(taskId, "COMMENT", pageable);
        List<Long> recordIds = records.getContent().stream().map(TaskUpdateRecordEntity::getId).toList();
        Map<Long, List<TaskUpdateRecordDetailEntity>> detailsByRecord = recordIds.isEmpty()
                ? Map.of()
                : detailRepository.findAllByRecord_IdInOrderByIdAsc(recordIds)
                .stream()
                .collect(Collectors.groupingBy(detail -> detail.getRecord().getId(), LinkedHashMap::new, Collectors.toList()));
        Page<TaskUpdateRecordSummary> mapped = records.map(record -> toSummary(record, detailsByRecord.getOrDefault(record.getId(), List.of())));
        return PageResponse.from(mapped);
    }

    private void saveRecord(TaskEntity task,
                             TaskUpdateRecordSource source,
                             String actionType,
                             String summary,
                             List<DetailInput> details) {
        TaskUpdateRecordEntity record = new TaskUpdateRecordEntity();
        record.setTask(task);
        record.setSource(source.name());
        record.setActionType(actionType);
        record.setSummary(summary);
        OperatorSnapshot operator = currentOperator(source);
        record.setOperatorUser(operator.user());
        record.setOperatorNameSnapshot(operator.name());
        details.forEach(input -> {
            TaskUpdateRecordDetailEntity detail = new TaskUpdateRecordDetailEntity();
            detail.setFieldCode(input.fieldCode());
            detail.setFieldName(input.fieldName());
            detail.setDetailType(input.detailType());
            detail.setOldValue(input.oldValue());
            detail.setNewValue(input.newValue());
            detail.setRelatedObjectId(input.relatedObjectId());
            detail.setRelatedObjectNameSnapshot(input.relatedObjectName());
            record.addDetail(detail);
        });
        recordRepository.save(record);
    }

    private TaskUpdateRecordSummary toSummary(TaskUpdateRecordEntity record, List<TaskUpdateRecordDetailEntity> details) {
        return new TaskUpdateRecordSummary(
                record.getId(), record.getTask().getId(),
                record.getOperatorUser() == null ? null : record.getOperatorUser().getId(),
                record.getOperatorNameSnapshot(), record.getSource(), record.getActionType(), record.getSummary(),
                record.getCreatedAt() == null ? null : record.getCreatedAt().format(TIME_FORMATTER),
                details.stream().map(detail -> new TaskUpdateRecordDetailSummary(
                        detail.getId(), detail.getFieldCode(), detail.getFieldName(), detail.getDetailType(),
                        detail.getOldValue(), detail.getNewValue(), detail.getRelatedObjectId(), detail.getRelatedObjectNameSnapshot()
                )).toList()
        );
    }

    private OperatorSnapshot currentOperator(TaskUpdateRecordSource source) {
        AuthContext context = AuthContextHolder.get().orElse(null);
        if (context != null && context.userId() != null) {
            UserEntity user = userRepository.findById(context.userId()).orElse(null);
            if (user != null) {
                return new OperatorSnapshot(user, displayName(user));
            }
        }
        return new OperatorSnapshot(null, source == TaskUpdateRecordSource.AI ? "AI" : "系统");
    }

    private String displayName(UserEntity user) {
        return user == null ? "" : (hasText(user.getNickname()) ? user.getNickname().trim() : text(user.getUsername()));
    }

    private String name(Object entity) {
        if (entity instanceof ProjectEntity value) return text(value.getName());
        if (entity instanceof AgentEntity value) return text(value.getName());
        if (entity instanceof IterationEntity value) return text(value.getName());
        if (entity instanceof TaskEntity value) return text(value.getName());
        return "";
    }

    private String format(Object value) {
        if (value == null) return "";
        if (value instanceof LocalDate date) return date.format(DATE_FORMATTER);
        if (value instanceof BigDecimal decimal) return decimal.stripTrailingZeros().toPlainString();
        return text(value);
    }

    private String text(String value) { return value == null ? "" : value; }
    private String text(Object value) { return value == null ? "" : String.valueOf(value); }
    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }

    private FieldSnapshot field(String value) {
        return new FieldSnapshot(text(value), null, null);
    }

    private FieldSnapshot relation(Object entity) {
        if (entity instanceof ProjectEntity value) {
            return new FieldSnapshot(text(value.getName()), value.getId(), text(value.getName()));
        }
        if (entity instanceof AgentEntity value) {
            return new FieldSnapshot(text(value.getName()), value.getId(), text(value.getName()));
        }
        if (entity instanceof IterationEntity value) {
            return new FieldSnapshot(text(value.getName()), value.getId(), text(value.getName()));
        }
        if (entity instanceof TaskEntity value) {
            return new FieldSnapshot(text(value.getName()), value.getId(), text(value.getName()));
        }
        return new FieldSnapshot("", null, null);
    }

    /** 字段展示值及其关联对象快照，避免历史记录依赖当前关联对象。 */
    public record FieldSnapshot(String value, Long relatedObjectId, String relatedObjectName) { }
    private record DetailInput(String fieldCode, String fieldName, String detailType, String oldValue,
                               String newValue, Long relatedObjectId, String relatedObjectName) { }
    private record OperatorSnapshot(UserEntity user, String name) { }
}
