package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestCaseStepEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.dto.IterationSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.TestCaseStepSummary;
import com.aiclub.platform.dto.TestCaseSummary;
import com.aiclub.platform.dto.TestPlanSummary;
import com.aiclub.platform.dto.request.TestCaseRequest;
import com.aiclub.platform.dto.request.TestCaseStepRequest;
import com.aiclub.platform.dto.request.TestPlanRequest;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class TestManagementService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final TestPlanRepository testPlanRepository;
    private final TestCaseRepository testCaseRepository;
    private final ProjectRepository projectRepository;
    private final IterationRepository iterationRepository;
    private final KnowledgeGraphService knowledgeGraphService;

    public TestManagementService(TestPlanRepository testPlanRepository,
                                 TestCaseRepository testCaseRepository,
                                 ProjectRepository projectRepository,
                                 IterationRepository iterationRepository,
                                 KnowledgeGraphService knowledgeGraphService) {
        this.testPlanRepository = testPlanRepository;
        this.testCaseRepository = testCaseRepository;
        this.projectRepository = projectRepository;
        this.iterationRepository = iterationRepository;
        this.knowledgeGraphService = knowledgeGraphService;
    }

    public PageResponse<TestPlanSummary> pageTestPlans(int page,
                                                       int size,
                                                       String keyword,
                                                       Long projectId,
                                                       Long iterationId,
                                                       String status) {
        Pageable pageable = buildPageable(page, size, Sort.by(Sort.Direction.DESC, "updatedAt", "id"));
        Page<TestPlanSummary> pageData = testPlanRepository.findAll(testPlanSpecification(keyword, projectId, iterationId, status), pageable)
                .map(entity -> toTestPlanSummary(entity, false));
        return PageResponse.from(pageData);
    }

    public TestPlanSummary getTestPlan(Long id) {
        return toTestPlanSummary(requireTestPlan(id), true);
    }

    public List<IterationSummary> listProjectIterationOptions(Long projectId) {
        requireProject(projectId);
        return iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId).stream()
                .map(this::toIterationSummary)
                .toList();
    }

    @Transactional
    public TestPlanSummary createTestPlan(TestPlanRequest request) {
        ProjectEntity project = requireProject(request.projectId());
        IterationEntity iteration = requireIteration(project.getId(), request.iterationId());
        TestPlanEntity entity = new TestPlanEntity();
        fillTestPlanEntity(entity, request, project, iteration);
        TestPlanSummary summary = toTestPlanSummary(testPlanRepository.save(entity), true);
        knowledgeGraphService.rebuildProjectGraph(project.getId());
        return summary;
    }

    @Transactional
    public TestPlanSummary updateTestPlan(Long id, TestPlanRequest request) {
        TestPlanEntity entity = requireTestPlan(id);
        ProjectEntity project = requireProject(request.projectId());
        IterationEntity iteration = requireIteration(project.getId(), request.iterationId());
        fillTestPlanEntity(entity, request, project, iteration);
        TestPlanSummary summary = toTestPlanSummary(testPlanRepository.save(entity), true);
        knowledgeGraphService.rebuildProjectGraph(project.getId());
        return summary;
    }

    @Transactional
    public void deleteTestPlan(Long id) {
        TestPlanEntity entity = requireTestPlan(id);
        Long projectId = entity.getProject().getId();
        testPlanRepository.delete(entity);
        knowledgeGraphService.rebuildProjectGraph(projectId);
    }

    private void fillTestPlanEntity(TestPlanEntity entity,
                                    TestPlanRequest request,
                                    ProjectEntity project,
                                    IterationEntity iteration) {
        entity.setName(request.name().trim());
        entity.setProject(project);
        entity.setIteration(iteration);
        entity.setStatus(normalizeStatus(request.status()));
        entity.setDescription(defaultString(request.description()));
        rebuildCases(entity, request.cases());
    }

    private void rebuildCases(TestPlanEntity entity, List<TestCaseRequest> caseRequests) {
        entity.getCases().clear();
        if (caseRequests == null || caseRequests.isEmpty()) {
            return;
        }

        int caseIndex = 0;
        for (TestCaseRequest caseRequest : caseRequests) {
            TestCaseEntity caseEntity = new TestCaseEntity();
            caseEntity.setTestPlan(entity);
            caseEntity.setTitle(caseRequest.title().trim());
            caseEntity.setModuleName(defaultString(caseRequest.moduleName()));
            caseEntity.setCaseType(normalizeCaseType(caseRequest.caseType()));
            caseEntity.setPriority(normalizePriority(caseRequest.priority()));
            caseEntity.setPrecondition(defaultString(caseRequest.precondition()));
            caseEntity.setRemarks(defaultString(caseRequest.remarks()));
            caseEntity.setSortOrder(caseRequest.sortOrder() == null ? caseIndex : Math.max(caseRequest.sortOrder(), 0));
            rebuildSteps(caseEntity, caseRequest.steps());
            entity.getCases().add(caseEntity);
            caseIndex++;
        }
    }

    private void rebuildSteps(TestCaseEntity caseEntity, List<TestCaseStepRequest> stepRequests) {
        caseEntity.getSteps().clear();
        if (stepRequests == null || stepRequests.isEmpty()) {
            return;
        }

        int stepIndex = 0;
        for (TestCaseStepRequest stepRequest : stepRequests) {
            TestCaseStepEntity stepEntity = new TestCaseStepEntity();
            stepEntity.setTestCase(caseEntity);
            stepEntity.setStepNo(stepRequest.stepNo() == null ? stepIndex + 1 : Math.max(stepRequest.stepNo(), 1));
            stepEntity.setAction(stepRequest.action().trim());
            stepEntity.setExpectedResult(stepRequest.expectedResult().trim());
            caseEntity.getSteps().add(stepEntity);
            stepIndex++;
        }
    }

    private TestPlanSummary toTestPlanSummary(TestPlanEntity entity, boolean includeCases) {
        List<TestCaseSummary> cases = includeCases
                ? entity.getCases().stream().map(this::toTestCaseSummary).toList()
                : List.of();
        int caseCount = includeCases ? cases.size() : Math.toIntExact(testCaseRepository.countByTestPlan_Id(entity.getId()));
        return new TestPlanSummary(
                entity.getId(),
                entity.getName(),
                entity.getStatus(),
                entity.getDescription(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getIteration() == null ? null : entity.getIteration().getId(),
                entity.getIteration() == null ? null : entity.getIteration().getName(),
                caseCount,
                formatTime(entity.getCreatedAt()),
                formatTime(entity.getUpdatedAt()),
                cases
        );
    }

    private TestCaseSummary toTestCaseSummary(TestCaseEntity entity) {
        return new TestCaseSummary(
                entity.getId(),
                entity.getTitle(),
                entity.getModuleName(),
                entity.getCaseType(),
                entity.getPriority(),
                entity.getPrecondition(),
                entity.getRemarks(),
                entity.getSortOrder(),
                entity.getSteps().stream().map(this::toTestCaseStepSummary).toList()
        );
    }

    private TestCaseStepSummary toTestCaseStepSummary(TestCaseStepEntity entity) {
        return new TestCaseStepSummary(
                entity.getId(),
                entity.getStepNo(),
                entity.getAction(),
                entity.getExpectedResult()
        );
    }

    private IterationSummary toIterationSummary(IterationEntity entity) {
        return new IterationSummary(
                entity.getId(),
                entity.getProject().getId(),
                entity.getProject().getName(),
                entity.getCreatorUser() == null ? null : entity.getCreatorUser().getId(),
                entity.getName(),
                entity.getGoal(),
                entity.getStatus(),
                formatDate(entity.getStartDate()),
                formatDate(entity.getEndDate()),
                entity.getDescription(),
                entity.getSortOrder(),
                0,
                false
        );
    }

    private Specification<TestPlanEntity> testPlanSpecification(String keyword,
                                                                Long projectId,
                                                                Long iterationId,
                                                                String status) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (hasText(keyword)) {
                String pattern = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern),
                        cb.like(cb.lower(root.get("description")), pattern)
                ));
            }
            if (projectId != null) {
                predicates.add(cb.equal(root.get("project").get("id"), projectId));
            }
            if (iterationId != null) {
                predicates.add(cb.equal(root.get("iteration").get("id"), iterationId));
            }
            if (hasText(status)) {
                predicates.add(cb.equal(root.get("status"), status.trim()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Pageable buildPageable(int page, int size, Sort sort) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(1, Math.min(size, 100));
        return PageRequest.of(safePage - 1, safeSize, sort);
    }

    private TestPlanEntity requireTestPlan(Long id) {
        return testPlanRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("测试计划不存在: " + id));
    }

    private ProjectEntity requireProject(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + id));
    }

    private IterationEntity requireIteration(Long projectId, Long iterationId) {
        return iterationRepository.findByIdAndProject_Id(iterationId, projectId)
                .orElseThrow(() -> new NoSuchElementException("迭代不存在: " + iterationId));
    }

    private String normalizeStatus(String value) {
        String result = defaultString(value).trim();
        return result.isBlank() ? "草稿" : result;
    }

    private String normalizeCaseType(String value) {
        String result = defaultString(value).trim();
        return result.isBlank() ? "功能测试" : result;
    }

    private String normalizePriority(String value) {
        String result = defaultString(value).trim();
        return result.isBlank() ? "P2" : result;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String formatTime(LocalDateTime value) {
        return value == null ? null : value.format(TIME_FORMATTER);
    }

    private String formatDate(java.time.LocalDate value) {
        return value == null ? null : value.toString();
    }
}
