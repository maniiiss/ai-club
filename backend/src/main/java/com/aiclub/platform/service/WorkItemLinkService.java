package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.TaskAttachmentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskTestCaseRelationEntity;
import com.aiclub.platform.domain.model.TaskWorkItemRelationEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TaskLinksSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.TaskLinkRequest;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskAttachmentRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.TaskTestCaseRelationRepository;
import com.aiclub.platform.repository.TaskWorkItemRelationRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import jakarta.persistence.criteria.JoinType;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 工作项详情关联服务。
 * 统一维护子工作项、普通关联工作项、测试用例和附件，供管理端与公众端复用。
 */
@Service
@Transactional(readOnly = true)
public class WorkItemLinkService {

    private static final String RELATION_CHILD = "CHILD";
    private static final String RELATION_RELATED = "RELATED";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TaskRepository taskRepository;
    private final TaskWorkItemRelationRepository taskWorkItemRelationRepository;
    private final TaskTestCaseRelationRepository taskTestCaseRelationRepository;
    private final TaskAttachmentRepository taskAttachmentRepository;
    private final TestCaseRepository testCaseRepository;
    private final DocumentAssetService documentAssetService;
    private final ProjectRepository projectRepository;
    private final DocumentAssetStorageService documentAssetStorageService;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final PlatformStoreService platformStoreService;
    private final AuthService authService;
    private final UserRepository userRepository;

    public WorkItemLinkService(TaskRepository taskRepository,
                               TaskWorkItemRelationRepository taskWorkItemRelationRepository,
                               TaskTestCaseRelationRepository taskTestCaseRelationRepository,
                               TaskAttachmentRepository taskAttachmentRepository,
                               TestCaseRepository testCaseRepository,
                               DocumentAssetService documentAssetService,
                               ProjectRepository projectRepository,
                               DocumentAssetStorageService documentAssetStorageService,
                               ProjectDataPermissionService projectDataPermissionService,
                               PlatformStoreService platformStoreService,
                               AuthService authService,
                               UserRepository userRepository) {
        this.taskRepository = taskRepository;
        this.taskWorkItemRelationRepository = taskWorkItemRelationRepository;
        this.taskTestCaseRelationRepository = taskTestCaseRelationRepository;
        this.taskAttachmentRepository = taskAttachmentRepository;
        this.testCaseRepository = testCaseRepository;
        this.documentAssetService = documentAssetService;
        this.projectRepository = projectRepository;
        this.documentAssetStorageService = documentAssetStorageService;
        this.projectDataPermissionService = projectDataPermissionService;
        this.platformStoreService = platformStoreService;
        this.authService = authService;
        this.userRepository = userRepository;
    }

    public TaskLinksSummary getLinks(Long taskId) {
        TaskEntity task = requireTask(taskId);
        List<TaskSummary> children = taskWorkItemRelationRepository
                .findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(task.getId(), RELATION_CHILD)
                .stream()
                .map(TaskWorkItemRelationEntity::getTargetTask)
                .map(this::toTaskSummary)
                .toList();
        List<TaskSummary> parentWorkItems = taskWorkItemRelationRepository
                .findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(task.getId(), RELATION_CHILD)
                .stream()
                .map(TaskWorkItemRelationEntity::getSourceTask)
                .map(this::toTaskSummary)
                .toList();
        List<TaskSummary> relatedWorkItems = relatedWorkItems(task);
        List<TaskLinksSummary.LinkedTestCaseSummary> testCases = taskTestCaseRelationRepository
                .findAllByTask_IdOrderByCreatedAtAscIdAsc(task.getId())
                .stream()
                .map(TaskTestCaseRelationEntity::getTestCase)
                .map(this::toLinkedTestCaseSummary)
                .toList();
        List<TaskLinksSummary.TaskAttachmentSummary> attachments = taskAttachmentRepository
                .findAllByTask_IdOrderByCreatedAtAscIdAsc(task.getId())
                .stream()
                .map(this::toAttachmentSummary)
                .toList();
        return new TaskLinksSummary(children, parentWorkItems, relatedWorkItems, testCases, attachments);
    }

    @Transactional
    public TaskLinksSummary addChild(Long taskId, TaskLinkRequest request) {
        TaskEntity parent = requireTask(taskId);
        TaskEntity child = requireTask(request.targetId());
        validateSameProject(parent, child, "关联工作项必须属于同一项目");
        validateDistinct(parent, child);
        validateNewRelation(parent.getId(), child.getId(), RELATION_CHILD);
        if (hasChildPath(child.getId(), parent.getId())) {
            throw new IllegalArgumentException("子工作项不能形成循环");
        }
        saveWorkItemRelation(parent, child, RELATION_CHILD);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary removeChild(Long taskId, Long childTaskId) {
        TaskEntity task = requireTask(taskId);
        requireTask(childTaskId);
        taskWorkItemRelationRepository.findBySourceTask_IdAndTargetTask_IdAndRelationType(task.getId(), childTaskId, RELATION_CHILD)
                .ifPresent(taskWorkItemRelationRepository::delete);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary addRelatedWorkItem(Long taskId, TaskLinkRequest request) {
        TaskEntity source = requireTask(taskId);
        TaskEntity target = requireTask(request.targetId());
        validateSameProject(source, target, "关联工作项必须属于同一项目");
        validateDistinct(source, target);
        Long firstId = Math.min(source.getId(), target.getId());
        Long secondId = Math.max(source.getId(), target.getId());
        validateNewRelation(firstId, secondId, RELATION_RELATED);
        saveWorkItemRelation(taskRepository.findById(firstId).orElseThrow(), taskRepository.findById(secondId).orElseThrow(), RELATION_RELATED);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary removeRelatedWorkItem(Long taskId, Long relatedTaskId) {
        TaskEntity task = requireTask(taskId);
        requireTask(relatedTaskId);
        Long firstId = Math.min(task.getId(), relatedTaskId);
        Long secondId = Math.max(task.getId(), relatedTaskId);
        taskWorkItemRelationRepository.findBySourceTask_IdAndTargetTask_IdAndRelationType(firstId, secondId, RELATION_RELATED)
                .ifPresent(taskWorkItemRelationRepository::delete);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary addTestCase(Long taskId, TaskLinkRequest request) {
        TaskEntity task = requireTask(taskId);
        TestCaseEntity testCase = requireTestCase(request.targetId());
        if (!testCase.getTestPlan().getProject().getId().equals(task.getProject().getId())) {
            throw new IllegalArgumentException("测试用例必须属于同一项目");
        }
        if (taskTestCaseRelationRepository.existsByTask_IdAndTestCase_Id(task.getId(), testCase.getId())) {
            throw new IllegalArgumentException("测试用例关系已存在");
        }
        TaskTestCaseRelationEntity relation = new TaskTestCaseRelationEntity();
        relation.setTask(task);
        relation.setTestCase(testCase);
        taskTestCaseRelationRepository.save(relation);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary removeTestCase(Long taskId, Long testCaseId) {
        TaskEntity task = requireTask(taskId);
        taskTestCaseRelationRepository.findByTask_IdAndTestCase_Id(task.getId(), testCaseId)
                .ifPresent(taskTestCaseRelationRepository::delete);
        return getLinks(taskId);
    }

    @Transactional
    public TaskLinksSummary.TaskAttachmentSummary uploadAttachment(Long taskId, MultipartFile file) {
        TaskEntity task = requireTask(taskId);
        DocumentAssetEntity asset = documentAssetService.uploadGenericAsset(file, "task-attachments");
        TaskAttachmentEntity attachment = new TaskAttachmentEntity();
        attachment.setTask(task);
        attachment.setDocumentAsset(asset);
        attachment.setUploaderUser(requireCurrentUser());
        TaskAttachmentEntity saved = taskAttachmentRepository.save(attachment);
        documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_TASK_ATTACHMENT, saved.getId());
        return toAttachmentSummary(saved);
    }

    public ResponseEntity<byte[]> downloadAttachment(Long taskId, Long attachmentId) {
        requireTask(taskId);
        TaskAttachmentEntity attachment = taskAttachmentRepository.findByIdAndTask_Id(attachmentId, taskId)
                .orElseThrow(() -> new NoSuchElementException("工作项附件不存在"));
        DocumentAssetEntity asset = attachment.getDocumentAsset();
        var content = documentAssetStorageService.load(asset.getObjectKey());
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            mediaType = MediaType.parseMediaType(content.contentType());
        } catch (Exception ignored) {
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(asset.getFileName(), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .body(content.bytes());
    }

    @Transactional
    public TaskLinksSummary removeAttachment(Long taskId, Long attachmentId) {
        requireTask(taskId);
        taskAttachmentRepository.findByIdAndTask_Id(attachmentId, taskId)
                .ifPresent(taskAttachmentRepository::delete);
        return getLinks(taskId);
    }

    public PageResponse<TaskLinksSummary.LinkedTestCaseSummary> pageProjectTestCases(Long projectId,
                                                                                     String keyword,
                                                                                     int page,
                                                                                     int size) {
        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        Pageable pageable = PageRequest.of(Math.max(page, 1) - 1, Math.max(size, 1), Sort.by(Sort.Direction.ASC, "sortOrder", "id"));
        var pageData = testCaseRepository.findAll(testCaseSpecification(projectId, keyword), pageable)
                .map(this::toLinkedTestCaseSummary);
        return PageResponse.from(pageData);
    }

    private List<TaskSummary> relatedWorkItems(TaskEntity task) {
        Map<Long, TaskSummary> result = new LinkedHashMap<>();
        taskWorkItemRelationRepository
                .findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(
                        RELATION_RELATED,
                        task.getId(),
                        RELATION_RELATED,
                        task.getId()
                )
                .forEach(relation -> {
                    TaskEntity other = relation.getSourceTask().getId().equals(task.getId())
                            ? relation.getTargetTask()
                            : relation.getSourceTask();
                    result.put(other.getId(), toTaskSummary(other));
                });
        if (task.getRequirementTask() != null) {
            result.putIfAbsent(task.getRequirementTask().getId(), toTaskSummary(task.getRequirementTask()));
        }
        return new ArrayList<>(result.values());
    }

    private void saveWorkItemRelation(TaskEntity source, TaskEntity target, String relationType) {
        TaskWorkItemRelationEntity relation = new TaskWorkItemRelationEntity();
        relation.setSourceTask(source);
        relation.setTargetTask(target);
        relation.setRelationType(relationType);
        taskWorkItemRelationRepository.save(relation);
    }

    private boolean hasChildPath(Long currentTaskId, Long targetTaskId) {
        if (currentTaskId.equals(targetTaskId)) {
            return true;
        }
        return taskWorkItemRelationRepository
                .findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(currentTaskId, RELATION_CHILD)
                .stream()
                .anyMatch(relation -> hasChildPath(relation.getTargetTask().getId(), targetTaskId));
    }

    private void validateDistinct(TaskEntity source, TaskEntity target) {
        if (source.getId().equals(target.getId())) {
            throw new IllegalArgumentException("工作项不能关联自身");
        }
    }

    private void validateSameProject(TaskEntity source, TaskEntity target, String message) {
        if (!source.getProject().getId().equals(target.getProject().getId())) {
            throw new IllegalArgumentException(message);
        }
    }

    private void validateNewRelation(Long sourceTaskId, Long targetTaskId, String relationType) {
        if (taskWorkItemRelationRepository.existsBySourceTask_IdAndTargetTask_IdAndRelationType(sourceTaskId, targetTaskId, relationType)) {
            throw new IllegalArgumentException("工作项关系已存在");
        }
    }

    private TaskEntity requireTask(Long taskId) {
        TaskEntity task = taskRepository.findById(taskId)
                .orElseThrow(() -> new NoSuchElementException("任务不存在: " + taskId));
        projectDataPermissionService.requireTaskVisible(task);
        return task;
    }

    private TestCaseEntity requireTestCase(Long testCaseId) {
        return testCaseRepository.findById(testCaseId)
                .orElseThrow(() -> new NoSuchElementException("测试用例不存在: " + testCaseId));
    }

    private UserEntity requireCurrentUser() {
        Long currentUserId = authService.currentUser().id();
        return userRepository.findById(currentUserId)
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
    }

    private TaskSummary toTaskSummary(TaskEntity task) {
        return platformStoreService.getTask(task.getId());
    }

    private TaskLinksSummary.LinkedTestCaseSummary toLinkedTestCaseSummary(TestCaseEntity testCase) {
        return new TaskLinksSummary.LinkedTestCaseSummary(
                testCase.getId(),
                testCase.getTitle(),
                testCase.getModuleName(),
                testCase.getCaseType(),
                testCase.getPriority(),
                testCase.getTestPlan().getId(),
                testCase.getTestPlan().getName(),
                testCase.getTestPlan().getProject().getId(),
                testCase.getTestPlan().getProject().getName()
        );
    }

    private TaskLinksSummary.TaskAttachmentSummary toAttachmentSummary(TaskAttachmentEntity attachment) {
        DocumentAssetEntity asset = attachment.getDocumentAsset();
        UserEntity uploader = attachment.getUploaderUser();
        return new TaskLinksSummary.TaskAttachmentSummary(
                attachment.getId(),
                asset.getId(),
                asset.getFileName(),
                asset.getContentType(),
                asset.getFileSize(),
                asset.getSourceFormat(),
                uploader == null ? null : uploader.getId(),
                uploader == null ? "" : displayName(uploader),
                attachment.getCreatedAt() == null ? null : attachment.getCreatedAt().format(TIME_FORMATTER)
        );
    }

    private Specification<TestCaseEntity> testCaseSpecification(Long projectId, String keyword) {
        return (root, query, cb) -> {
            var plan = root.join("testPlan", JoinType.INNER);
            var project = plan.join("project", JoinType.INNER);
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(project.get("id"), projectId));
            if (keyword != null && !keyword.trim().isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), pattern),
                        cb.like(cb.lower(root.get("moduleName")), pattern),
                        cb.like(cb.lower(plan.get("name")), pattern)
                ));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
    }

    private String displayName(UserEntity user) {
        if (user.getNickname() != null && !user.getNickname().trim().isBlank()) {
            return user.getNickname().trim();
        }
        return user.getUsername();
    }
}
