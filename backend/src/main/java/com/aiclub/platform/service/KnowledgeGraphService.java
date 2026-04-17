package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.IterationEntity;
import com.aiclub.platform.domain.model.KnowledgeGraphEdgeEntity;
import com.aiclub.platform.domain.model.KnowledgeGraphNodeEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.KnowledgeGraphEdgeSummary;
import com.aiclub.platform.dto.KnowledgeGraphNodeSummary;
import com.aiclub.platform.dto.KnowledgeGraphSummary;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.IterationRepository;
import com.aiclub.platform.repository.KnowledgeGraphEdgeRepository;
import com.aiclub.platform.repository.KnowledgeGraphNodeRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;

@Service
@Transactional(readOnly = true)
public class KnowledgeGraphService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private static final String NODE_PROJECT = "PROJECT";
    private static final String NODE_ITERATION = "ITERATION";
    private static final String NODE_REQUIREMENT = "REQUIREMENT";
    private static final String NODE_TASK = "TASK";
    private static final String NODE_BUG = "BUG";
    private static final String NODE_TEST_PLAN = "TEST_PLAN";
    private static final String NODE_TEST_CASE = "TEST_CASE";
    private static final String NODE_USER = "USER";
    private static final String NODE_AGENT = "AGENT";
    private static final String NODE_WIKI_SPACE = "WIKI_SPACE";
    private static final String NODE_WIKI_DIRECTORY = "WIKI_DIRECTORY";
    private static final String NODE_WIKI_PAGE = "WIKI_PAGE";

    private final ProjectRepository projectRepository;
    private final IterationRepository iterationRepository;
    private final TaskRepository taskRepository;
    private final TestPlanRepository testPlanRepository;
    private final AgentRepository agentRepository;
    private final KnowledgeGraphNodeRepository knowledgeGraphNodeRepository;
    private final KnowledgeGraphEdgeRepository knowledgeGraphEdgeRepository;
    private final WikiSpaceService wikiSpaceService;
    private final ObjectMapper objectMapper;

    public KnowledgeGraphService(ProjectRepository projectRepository,
                                 IterationRepository iterationRepository,
                                 TaskRepository taskRepository,
                                 TestPlanRepository testPlanRepository,
                                 AgentRepository agentRepository,
                                 KnowledgeGraphNodeRepository knowledgeGraphNodeRepository,
                                 KnowledgeGraphEdgeRepository knowledgeGraphEdgeRepository,
                                 WikiSpaceService wikiSpaceService,
                                 ObjectMapper objectMapper) {
        this.projectRepository = projectRepository;
        this.iterationRepository = iterationRepository;
        this.taskRepository = taskRepository;
        this.testPlanRepository = testPlanRepository;
        this.agentRepository = agentRepository;
        this.knowledgeGraphNodeRepository = knowledgeGraphNodeRepository;
        this.knowledgeGraphEdgeRepository = knowledgeGraphEdgeRepository;
        this.wikiSpaceService = wikiSpaceService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public KnowledgeGraphSummary getProjectGraph(Long projectId, boolean refresh) {
        requireProject(projectId);
        if (refresh || !knowledgeGraphNodeRepository.existsByProjectId(projectId)) {
            rebuildProjectGraph(projectId);
        }
        return loadProjectGraph(projectId);
    }

    @Transactional
    public KnowledgeGraphSummary rebuildProjectGraph(Long projectId) {
        ProjectEntity project = requireProject(projectId);
        List<IterationEntity> iterations = iterationRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId);
        List<TaskEntity> tasks = taskRepository.findAllByProject_IdOrderByUpdatedAtAscIdAsc(projectId);
        List<TestPlanEntity> testPlans = testPlanRepository.findAllByProject_IdOrderByUpdatedAtDescIdDesc(projectId);
        List<AgentEntity> projectAgents = agentRepository.findAllByProject_IdOrderByIdAsc(projectId);
        WikiSpaceService.WikiProjectGraphProjection wikiProjection = wikiSpaceService.buildProjectGraphProjection(projectId);

        knowledgeGraphEdgeRepository.deleteAllByProjectId(projectId);
        knowledgeGraphNodeRepository.deleteAllByProjectId(projectId);

        LinkedHashMap<String, KnowledgeGraphNodeEntity> nodeMap = new LinkedHashMap<>();
        List<PendingEdge> pendingEdges = new ArrayList<>();

        KnowledgeGraphNodeEntity projectNode = putNode(
                nodeMap,
                projectId,
                NODE_PROJECT,
                project.getId(),
                project.getName(),
                project.getDescription(),
                metadataJson(Map.of(
                        "status", defaultString(project.getStatus()),
                        "owner", defaultString(project.getOwner())
                ))
        );

        LinkedHashSet<UserEntity> projectUsers = new LinkedHashSet<>();
        if (project.getOwnerUser() != null) {
            projectUsers.add(project.getOwnerUser());
        }
        projectUsers.addAll(project.getMembers());

        for (IterationEntity iteration : iterations) {
            KnowledgeGraphNodeEntity iterationNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_ITERATION,
                    iteration.getId(),
                    iteration.getName(),
                    iteration.getDescription(),
                    metadataJson(Map.of(
                            "status", defaultString(iteration.getStatus()),
                            "goal", defaultString(iteration.getGoal()),
                            "startDate", stringValue(iteration.getStartDate()),
                            "endDate", stringValue(iteration.getEndDate())
                    ))
            );
            addEdge(pendingEdges, projectId, projectNode, iterationNode, "HAS_ITERATION");
        }

        for (TaskEntity task : tasks) {
            KnowledgeGraphNodeEntity taskNode = putNode(
                    nodeMap,
                    projectId,
                    resolveTaskNodeType(task.getWorkItemType()),
                    task.getId(),
                    task.getName(),
                    task.getDescription(),
                    metadataJson(Map.of(
                            "workItemType", defaultString(task.getWorkItemType()),
                            "status", defaultString(task.getStatus()),
                            "priority", defaultString(task.getPriority()),
                            "updatedAt", stringValue(task.getUpdatedAt())
                    ))
            );
            addEdge(pendingEdges, projectId, projectNode, taskNode, "HAS_WORK_ITEM");

            if (task.getIteration() != null) {
                KnowledgeGraphNodeEntity iterationNode = putNode(
                        nodeMap,
                        projectId,
                        NODE_ITERATION,
                        task.getIteration().getId(),
                        task.getIteration().getName(),
                        task.getIteration().getDescription(),
                        metadataJson(Map.of(
                                "status", defaultString(task.getIteration().getStatus()),
                                "goal", defaultString(task.getIteration().getGoal()),
                                "startDate", stringValue(task.getIteration().getStartDate()),
                                "endDate", stringValue(task.getIteration().getEndDate())
                        ))
                );
                addEdge(pendingEdges, projectId, iterationNode, taskNode, "HAS_WORK_ITEM");
            }

            if (task.getRequirementTask() != null) {
                TaskEntity requirementTask = task.getRequirementTask();
                KnowledgeGraphNodeEntity requirementNode = putNode(
                        nodeMap,
                        projectId,
                        resolveTaskNodeType(requirementTask.getWorkItemType()),
                        requirementTask.getId(),
                        requirementTask.getName(),
                        requirementTask.getDescription(),
                        metadataJson(Map.of(
                                "workItemType", defaultString(requirementTask.getWorkItemType()),
                                "status", defaultString(requirementTask.getStatus()),
                                "priority", defaultString(requirementTask.getPriority()),
                                "updatedAt", stringValue(requirementTask.getUpdatedAt())
                        ))
                );
                addEdge(pendingEdges, projectId, taskNode, requirementNode, "RELATES_TO_REQUIREMENT");
            }

            if (task.getAssigneeUser() != null) {
                projectUsers.add(task.getAssigneeUser());
                KnowledgeGraphNodeEntity assigneeNode = userNode(nodeMap, projectId, task.getAssigneeUser());
                addEdge(pendingEdges, projectId, taskNode, assigneeNode, "ASSIGNED_TO");
            }

            for (UserEntity collaborator : task.getCollaborators()) {
                projectUsers.add(collaborator);
                KnowledgeGraphNodeEntity collaboratorNode = userNode(nodeMap, projectId, collaborator);
                addEdge(pendingEdges, projectId, taskNode, collaboratorNode, "COLLABORATES_WITH");
            }

            if (task.getAgent() != null) {
                KnowledgeGraphNodeEntity agentNode = agentNode(nodeMap, projectId, task.getAgent());
                addEdge(pendingEdges, projectId, taskNode, agentNode, "EXECUTED_BY_AGENT");
            }
        }

        for (UserEntity member : projectUsers) {
            KnowledgeGraphNodeEntity userNode = userNode(nodeMap, projectId, member);
            if (project.getOwnerUser() != null && project.getOwnerUser().getId().equals(member.getId())) {
                addEdge(pendingEdges, projectId, projectNode, userNode, "OWNED_BY");
            } else {
                addEdge(pendingEdges, projectId, projectNode, userNode, "HAS_MEMBER");
            }
        }

        for (AgentEntity agent : projectAgents) {
            KnowledgeGraphNodeEntity agentNode = agentNode(nodeMap, projectId, agent);
            addEdge(pendingEdges, projectId, projectNode, agentNode, "HAS_AGENT");
        }

        for (TestPlanEntity testPlan : testPlans) {
            KnowledgeGraphNodeEntity planNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_TEST_PLAN,
                    testPlan.getId(),
                    testPlan.getName(),
                    testPlan.getDescription(),
                    metadataJson(Map.of(
                            "status", defaultString(testPlan.getStatus()),
                            "iterationId", testPlan.getIteration() == null ? "" : stringValue(testPlan.getIteration().getId()),
                            "caseCount", testPlan.getCases().size()
                    ))
            );
            addEdge(pendingEdges, projectId, projectNode, planNode, "HAS_TEST_PLAN");

            if (testPlan.getIteration() != null) {
                KnowledgeGraphNodeEntity iterationNode = putNode(
                        nodeMap,
                        projectId,
                        NODE_ITERATION,
                        testPlan.getIteration().getId(),
                        testPlan.getIteration().getName(),
                        testPlan.getIteration().getDescription(),
                        metadataJson(Map.of(
                                "status", defaultString(testPlan.getIteration().getStatus()),
                                "goal", defaultString(testPlan.getIteration().getGoal()),
                                "startDate", stringValue(testPlan.getIteration().getStartDate()),
                                "endDate", stringValue(testPlan.getIteration().getEndDate())
                        ))
                );
                addEdge(pendingEdges, projectId, iterationNode, planNode, "HAS_TEST_PLAN");
            }

            for (TestCaseEntity testCase : testPlan.getCases()) {
                KnowledgeGraphNodeEntity caseNode = putNode(
                        nodeMap,
                        projectId,
                        NODE_TEST_CASE,
                        testCase.getId(),
                        testCase.getTitle(),
                        testCase.getRemarks(),
                        metadataJson(Map.of(
                                "moduleName", defaultString(testCase.getModuleName()),
                                "caseType", defaultString(testCase.getCaseType()),
                                "priority", defaultString(testCase.getPriority()),
                                "sortOrder", testCase.getSortOrder()
                        ))
                );
                addEdge(pendingEdges, projectId, planNode, caseNode, "HAS_TEST_CASE");
            }
        }

        for (WikiSpaceEntity wikiSpace : wikiProjection.spaces()) {
            KnowledgeGraphNodeEntity spaceNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_WIKI_SPACE,
                    wikiSpace.getId(),
                    wikiSpace.getName(),
                    wikiSpace.getDescription(),
                    metadataJson(Map.of(
                            "readScope", defaultString(wikiSpace.getReadScope()),
                            "updatedAt", stringValue(wikiSpace.getUpdatedAt())
                    ))
            );
            addEdge(pendingEdges, projectId, projectNode, spaceNode, "HAS_WIKI_SPACE");
        }

        for (WikiDirectoryEntity directory : wikiProjection.directories()) {
            KnowledgeGraphNodeEntity directoryNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_WIKI_DIRECTORY,
                    directory.getId(),
                    directory.getName(),
                    "",
                    metadataJson(Map.of(
                            "slug", defaultString(directory.getSlug()),
                            "boundProjectId", directory.getBoundProject() == null ? "" : stringValue(directory.getBoundProject().getId()),
                            "updatedAt", stringValue(directory.getUpdatedAt())
                    ))
            );
            KnowledgeGraphNodeEntity spaceNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_WIKI_SPACE,
                    directory.getSpace().getId(),
                    directory.getSpace().getName(),
                    directory.getSpace().getDescription(),
                    metadataJson(Map.of(
                            "readScope", defaultString(directory.getSpace().getReadScope()),
                            "updatedAt", stringValue(directory.getSpace().getUpdatedAt())
                    ))
            );
            addEdge(pendingEdges, projectId, spaceNode, directoryNode, "HAS_WIKI_DIRECTORY");
            if (directory.getBoundProject() != null && Objects.equals(directory.getBoundProject().getId(), projectId)) {
                addEdge(pendingEdges, projectId, projectNode, directoryNode, "PROJECT_HAS_WIKI_DIRECTORY");
            }
            if (directory.getParentDirectory() != null) {
                KnowledgeGraphNodeEntity parentDirectoryNode = putNode(
                        nodeMap,
                        projectId,
                        NODE_WIKI_DIRECTORY,
                        directory.getParentDirectory().getId(),
                        directory.getParentDirectory().getName(),
                        "",
                        metadataJson(Map.of(
                                "slug", defaultString(directory.getParentDirectory().getSlug()),
                                "boundProjectId", directory.getParentDirectory().getBoundProject() == null ? "" : stringValue(directory.getParentDirectory().getBoundProject().getId()),
                                "updatedAt", stringValue(directory.getParentDirectory().getUpdatedAt())
                        ))
                );
                addEdge(pendingEdges, projectId, parentDirectoryNode, directoryNode, "WIKI_CHILD_OF");
            }
        }

        for (WikiPageV2Entity wikiPage : wikiProjection.pages()) {
            KnowledgeGraphNodeEntity pageNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_WIKI_PAGE,
                    wikiPage.getId(),
                    wikiPage.getTitle(),
                    wikiPage.getContent(),
                    metadataJson(Map.of(
                            "slug", defaultString(wikiPage.getSlug()),
                            "versionCount", wikiSpaceService.countPageVersions(wikiPage.getId()),
                            "updatedAt", stringValue(wikiPage.getUpdatedAt())
                    ))
            );
            KnowledgeGraphNodeEntity directoryNode = putNode(
                    nodeMap,
                    projectId,
                    NODE_WIKI_DIRECTORY,
                    wikiPage.getDirectory().getId(),
                    wikiPage.getDirectory().getName(),
                    "",
                    metadataJson(Map.of(
                            "slug", defaultString(wikiPage.getDirectory().getSlug()),
                            "boundProjectId", wikiPage.getDirectory().getBoundProject() == null ? "" : stringValue(wikiPage.getDirectory().getBoundProject().getId()),
                            "updatedAt", stringValue(wikiPage.getDirectory().getUpdatedAt())
                    ))
            );
            addEdge(pendingEdges, projectId, directoryNode, pageNode, "HAS_WIKI_PAGE");
        }

        knowledgeGraphNodeRepository.saveAll(nodeMap.values());

        LinkedHashSet<String> edgeKeys = new LinkedHashSet<>();
        List<KnowledgeGraphEdgeEntity> edges = new ArrayList<>();
        for (PendingEdge pendingEdge : pendingEdges) {
            String edgeKey = pendingEdge.fromNode().getId() + ":" + pendingEdge.toNode().getId() + ":" + pendingEdge.edgeType();
            if (!edgeKeys.add(edgeKey)) {
                continue;
            }
            KnowledgeGraphEdgeEntity edge = new KnowledgeGraphEdgeEntity();
            edge.setProjectId(projectId);
            edge.setFromNode(pendingEdge.fromNode());
            edge.setToNode(pendingEdge.toNode());
            edge.setEdgeType(pendingEdge.edgeType());
            edge.setSourceType("SYSTEM");
            edge.setConfidence(BigDecimal.ONE);
            edge.setStatus("CONFIRMED");
            edge.setEvidenceText("");
            edges.add(edge);
        }
        knowledgeGraphEdgeRepository.saveAll(edges);

        return loadProjectGraph(projectId);
    }

    private KnowledgeGraphSummary loadProjectGraph(Long projectId) {
        List<KnowledgeGraphNodeSummary> nodes = knowledgeGraphNodeRepository.findAllByProjectIdOrderByNodeTypeAscNameAsc(projectId)
                .stream()
                .map(node -> new KnowledgeGraphNodeSummary(
                        node.getId(),
                        node.getNodeType(),
                        node.getBizId(),
                        node.getName(),
                        node.getDescription(),
                        node.getMetadataJson()
                ))
                .toList();
        List<KnowledgeGraphEdgeSummary> edges = knowledgeGraphEdgeRepository.findAllByProjectIdOrderByEdgeTypeAscIdAsc(projectId)
                .stream()
                .map(edge -> new KnowledgeGraphEdgeSummary(
                        edge.getId(),
                        edge.getFromNode().getId(),
                        edge.getToNode().getId(),
                        edge.getEdgeType(),
                        edge.getSourceType(),
                        edge.getConfidence() == null ? null : edge.getConfidence().doubleValue(),
                        edge.getStatus(),
                        edge.getEvidenceText()
                ))
                .toList();
        return new KnowledgeGraphSummary(
                projectId,
                nodes.size(),
                edges.size(),
                LocalDateTime.now().format(TIME_FORMATTER),
                nodes,
                edges
        );
    }

    private ProjectEntity requireProject(Long projectId) {
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));
    }

    private KnowledgeGraphNodeEntity userNode(Map<String, KnowledgeGraphNodeEntity> nodeMap,
                                              Long projectId,
                                              UserEntity user) {
        return putNode(
                nodeMap,
                projectId,
                NODE_USER,
                user.getId(),
                displayName(user),
                "",
                metadataJson(Map.of(
                        "username", defaultString(user.getUsername()),
                        "enabled", user.isEnabled()
                ))
        );
    }

    private KnowledgeGraphNodeEntity agentNode(Map<String, KnowledgeGraphNodeEntity> nodeMap,
                                               Long projectId,
                                               AgentEntity agent) {
        return putNode(
                nodeMap,
                projectId,
                NODE_AGENT,
                agent.getId(),
                agent.getName(),
                agent.getDescription(),
                metadataJson(Map.of(
                        "type", defaultString(agent.getType()),
                        "category", defaultString(agent.getCategory()),
                        "status", defaultString(agent.getStatus()),
                        "enabled", Boolean.TRUE.equals(agent.getEnabled())
                ))
        );
    }

    private KnowledgeGraphNodeEntity putNode(Map<String, KnowledgeGraphNodeEntity> nodeMap,
                                             Long projectId,
                                             String nodeType,
                                             Long bizId,
                                             String name,
                                             String description,
                                             String metadataJson) {
        String key = nodeType + ":" + bizId;
        KnowledgeGraphNodeEntity existing = nodeMap.get(key);
        if (existing != null) {
            return existing;
        }
        KnowledgeGraphNodeEntity node = new KnowledgeGraphNodeEntity();
        node.setProjectId(projectId);
        node.setNodeType(nodeType);
        node.setBizId(bizId);
        node.setName(defaultString(name));
        node.setDescription(defaultString(description));
        node.setMetadataJson(defaultString(metadataJson).isBlank() ? "{}" : metadataJson);
        nodeMap.put(key, node);
        return node;
    }

    private void addEdge(List<PendingEdge> pendingEdges,
                         Long projectId,
                         KnowledgeGraphNodeEntity fromNode,
                         KnowledgeGraphNodeEntity toNode,
                         String edgeType) {
        if (fromNode == null || toNode == null) {
            return;
        }
        pendingEdges.add(new PendingEdge(projectId, fromNode, toNode, edgeType));
    }

    private String resolveTaskNodeType(String workItemType) {
        String value = defaultString(workItemType).trim();
        if ("需求".equals(value)) {
            return NODE_REQUIREMENT;
        }
        if ("缺陷".equals(value)) {
            return NODE_BUG;
        }
        return NODE_TASK;
    }

    private String metadataJson(Map<String, Object> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException exception) {
            return "{}";
        }
    }

    private String displayName(UserEntity user) {
        String nickname = defaultString(user.getNickname()).trim();
        return nickname.isBlank() ? defaultString(user.getUsername()) : nickname;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private record PendingEdge(
            Long projectId,
            KnowledgeGraphNodeEntity fromNode,
            KnowledgeGraphNodeEntity toNode,
            String edgeType
    ) {
    }
}
