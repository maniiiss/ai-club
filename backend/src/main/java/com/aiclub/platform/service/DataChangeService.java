package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DataChangeRequestEntity;
import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeAuditItem;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeDsl;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangePreviewResult;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataChangeRequestItem;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.repository.DataChangeAuditRepository;
import com.aiclub.platform.repository.DataChangeRequestRepository;
import com.aiclub.platform.repository.DataWorkbenchEntityRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * DataChange 工单服务。
 * 业务意图：串联 NL/DSL 解析、预览、提交、审批、执行和回滚的应用流程。
 */
@Service
@Transactional(readOnly = true)
public class DataChangeService {

    private final DataWorkbenchEntityRepository entityRepository;
    private final DataChangeRequestRepository requestRepository;
    private final DataChangeAuditRepository auditRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final DataWorkbenchPermissionSupport permissionSupport;
    private final DataChangeDslService dslService;
    private final DataChangeSqlExecutor sqlExecutor;
    private final DataWorkbenchMapper mapper;

    public DataChangeService(DataWorkbenchEntityRepository entityRepository,
                             DataChangeRequestRepository requestRepository,
                             DataChangeAuditRepository auditRepository,
                             ProjectRepository projectRepository,
                             UserRepository userRepository,
                             ProjectDataPermissionService projectDataPermissionService,
                             DataWorkbenchPermissionSupport permissionSupport,
                             DataChangeDslService dslService,
                             DataChangeSqlExecutor sqlExecutor,
                             DataWorkbenchMapper mapper) {
        this.entityRepository = entityRepository;
        this.requestRepository = requestRepository;
        this.auditRepository = auditRepository;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.permissionSupport = permissionSupport;
        this.dslService = dslService;
        this.sqlExecutor = sqlExecutor;
        this.mapper = mapper;
    }

    public List<com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityItem> listProjectEntities(Long projectId) {
        ProjectEntity project = requireVisibleProject(projectId);
        // 项目实体在配置层已经与平台项目一一绑定，直接按项目查即可，不再依赖 requestScope 二次过滤可见性；
        // requestScope 只在“能否提交/预览”环节使用。
        return entityRepository.findAllByPlatformProjectIdAndEnabledTrueOrderByIdAsc(projectId).stream()
                .filter(entity -> canRequest(project, entity))
                .map(mapper::toEntityItem)
                .toList();
    }

    /**
     * 校验当前用户是否可见指定项目。
     * 业务意图：供 DataWorkbench 项目级入口复用项目数据权限，避免只凭功能权限暴露项目能力。
     */
    public void validateProjectVisible(Long projectId) {
        requireVisibleProject(projectId);
    }

    public DataChangeDsl parse(Long projectId, String text, String entityCode, java.util.Map<String, Object> dsl) {
        requireVisibleProject(projectId);
        return dslService.resolveDsl(projectId, text, entityCode, dsl);
    }

    public DataChangePreviewResult preview(Long projectId, String text, String entityCode, java.util.Map<String, Object> rawDsl) {
        ProjectEntity project = requireVisibleProject(projectId);
        DataChangeDsl dsl = dslService.resolveDsl(projectId, text, entityCode, rawDsl);
        DataWorkbenchEntity entity = requireProjectEntity(projectId, dsl.entityCode());
        permissionSupport.requireProjectScope(project, entity.getRequestScope(), "当前角色不允许在该项目提交数据变更");
        return sqlExecutor.preview(entity, dsl);
    }

    @Transactional
    public DataChangeRequestItem submit(Long projectId, String text, String entityCode, java.util.Map<String, Object> rawDsl) {
        ProjectEntity project = requireVisibleProject(projectId);
        DataChangePreviewResult preview = preview(projectId, text, entityCode, rawDsl);
        DataWorkbenchEntity entity = requireProjectEntity(projectId, preview.dsl().entityCode());
        DataChangeRequestEntity request = new DataChangeRequestEntity();
        request.setProject(project);
        request.setEntity(entity);
        request.setRequesterUser(currentUser());
        request.setOriginalText(text);
        request.setDslJson(mapper.toJson(preview.dsl()));
        request.setPreviewSqlSummary(preview.sqlSummary());
        request.setRiskLevel(preview.riskLevel());
        request.setApprovalStatus(preview.approvalRequired() ? "PENDING" : "NOT_REQUIRED");
        request.setExecutionStatus("SUBMITTED");
        request.setAffectedRows(preview.affectedRows());
        request.setRiskReasons(String.join("\n", preview.riskReasons()));
        return mapper.toRequestItem(requestRepository.save(request));
    }

    public PageResponse<DataChangeRequestItem> pageProjectRequests(Long projectId, int page, int size) {
        ProjectEntity project = requireVisibleProject(projectId);
        return pageRequests(page, size, (root, query, cb) -> cb.equal(root.get("project"), project));
    }

    public PageResponse<DataChangeRequestItem> pageAllRequests(int page, int size, Long projectId, String approvalStatus, String executionStatus) {
        return pageRequests(page, size, (root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            if (approvalStatus != null && !approvalStatus.isBlank()) {
                predicates.add(cb.equal(root.get("approvalStatus"), approvalStatus));
            }
            if (executionStatus != null && !executionStatus.isBlank()) {
                predicates.add(cb.equal(root.get("executionStatus"), executionStatus));
            }
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        });
    }

    @Transactional
    public DataChangeRequestItem approve(Long id) {
        DataChangeRequestEntity request = requireRequest(id);
        requireProjectMatchesEntity(request);
        permissionSupport.requireProjectScope(request.getProject(), request.getEntity().getExecuteScope(), "当前角色不允许审批该项目数据变更");
        request.setApprovalStatus("APPROVED");
        request.setApproverUser(currentUser());
        request.setApprovedAt(LocalDateTime.now());
        return mapper.toRequestItem(requestRepository.save(request));
    }

    @Transactional
    public DataChangeRequestItem reject(Long id, String reason) {
        DataChangeRequestEntity request = requireRequest(id);
        requireProjectMatchesEntity(request);
        permissionSupport.requireProjectScope(request.getProject(), request.getEntity().getExecuteScope(), "当前角色不允许驳回该项目数据变更");
        request.setApprovalStatus("REJECTED");
        request.setExecutionStatus("REJECTED");
        request.setRejectReason(reason == null ? "" : reason.trim());
        request.setApproverUser(currentUser());
        request.setApprovedAt(LocalDateTime.now());
        return mapper.toRequestItem(requestRepository.save(request));
    }

    @Transactional
    public DataChangeRequestItem execute(Long id) {
        DataChangeRequestEntity request = requireRequest(id);
        requireProjectMatchesEntity(request);
        permissionSupport.requireProjectScope(request.getProject(), request.getEntity().getExecuteScope(), "当前角色不允许执行该项目数据变更");
        if ("PENDING".equals(request.getApprovalStatus())) {
            throw new IllegalArgumentException("数据变更尚未审批通过");
        }
        if ("REJECTED".equals(request.getApprovalStatus())) {
            throw new IllegalArgumentException("数据变更已被驳回");
        }
        request.setExecutorUser(currentUser());
        request.setExecutionStatus("EXECUTING");
        requestRepository.save(request);
        return mapper.toRequestItem(sqlExecutor.execute(request));
    }

    @Transactional
    public DataChangeRequestItem rollback(Long id) {
        DataChangeRequestEntity request = requireRequest(id);
        requireProjectMatchesEntity(request);
        permissionSupport.requireProjectScope(request.getProject(), request.getEntity().getRollbackScope(), "当前角色不允许回滚该项目数据变更");
        request.setRollbackUser(currentUser());
        return mapper.toRequestItem(sqlExecutor.rollback(request));
    }

    public List<DataChangeAuditItem> listAudits(Long requestId) {
        DataChangeRequestEntity request = requireRequest(requestId);
        projectDataPermissionService.requireProjectVisible(request.getProject());
        return auditRepository.findAllByRequest_IdOrderByIdAsc(requestId).stream()
                .map(mapper::toAuditItem)
                .toList();
    }

    private PageResponse<DataChangeRequestItem> pageRequests(int page, int size, Specification<DataChangeRequestEntity> spec) {
        var pageData = requestRepository.findAll(
                spec,
                PageRequest.of(Math.max(0, page - 1), Math.max(1, Math.min(size, 100)), Sort.by(Sort.Direction.DESC, "createdAt", "id"))
        ).map(mapper::toRequestItem);
        return PageResponse.from(pageData);
    }

    private boolean canRequest(ProjectEntity project, DataWorkbenchEntity entity) {
        try {
            permissionSupport.requireProjectScope(project, entity.getRequestScope(), "无权提交");
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    /**
     * 工单归属项目必须与实体绑定的平台项目一致，否则视为跨项目串数据。
     */
    private void requireProjectMatchesEntity(DataChangeRequestEntity request) {
        Long requestProjectId = request.getProject() == null ? null : request.getProject().getId();
        Long entityProjectId = request.getEntity() == null || request.getEntity().getPlatformProject() == null
                ? null
                : request.getEntity().getPlatformProject().getId();
        if (requestProjectId == null || entityProjectId == null || !requestProjectId.equals(entityProjectId)) {
            throw new IllegalArgumentException("实体绑定项目与工单项目不一致，禁止操作");
        }
    }

    /**
     * 按平台项目 + 实体编码定位实体，避免跨项目引用他人配置。
     */
    private DataWorkbenchEntity requireProjectEntity(Long projectId, String entityCode) {
        return entityRepository.findWithFieldsByPlatformProjectIdAndEntityCode(projectId, entityCode)
                .orElseThrow(() -> new NoSuchElementException("项目内未找到 DataWorkbench 实体: " + entityCode));
    }

    private DataChangeRequestEntity requireRequest(Long id) {
        return requestRepository.findWithDetailsById(id)
                .orElseThrow(() -> new NoSuchElementException("DataChange 工单不存在: " + id));
    }

    private UserEntity currentUser() {
        Long userId = AuthContextHolder.get().orElseThrow().userId();
        return userRepository.findById(userId).orElse(null);
    }
}
