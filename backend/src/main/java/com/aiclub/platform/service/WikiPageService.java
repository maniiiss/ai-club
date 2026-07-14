package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiPageAccessEntity;
import com.aiclub.platform.domain.model.WikiPageEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskEntity;
import com.aiclub.platform.domain.model.WikiPageVersionEntity;
import com.aiclub.platform.dto.WikiPageDetail;
import com.aiclub.platform.dto.WikiPageSummary;
import com.aiclub.platform.dto.WikiPageTreeNode;
import com.aiclub.platform.dto.WikiPageVersionSummary;
import com.aiclub.platform.dto.WikiSemanticSearchResult;
import com.aiclub.platform.dto.request.CreateWikiPageRequest;
import com.aiclub.platform.dto.request.UpdateWikiPageRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.repository.WikiPageAccessRepository;
import com.aiclub.platform.repository.WikiPageRepository;
import com.aiclub.platform.repository.WikiPageSyncTaskRepository;
import com.aiclub.platform.repository.WikiPageVersionRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.text.Normalizer;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Wiki 页面核心服务，统一承载页面 CRUD、版本历史、页面级权限和知识索引同步。
 */
@Service
@Transactional(readOnly = true)
public class WikiPageService {

    /** 页面公开给所有已登录用户。 */
    public static final String VISIBILITY_PUBLIC = "PUBLIC";

    /** 页面仅项目可见成员可读。 */
    public static final String VISIBILITY_PROJECT_MEMBERS = "PROJECT_MEMBERS";

    /** 页面仅指定用户可读。 */
    public static final String VISIBILITY_SPECIFIC_USERS = "SPECIFIC_USERS";

    /** 页面查看授权。 */
    private static final String ACCESS_VIEW = "VIEW";

    /** 页面编辑授权。 */
    private static final String ACCESS_EDIT = "EDIT";

    /** 页面写入或更新知识索引的同步操作。 */
    private static final String SYNC_OPERATION_RETAIN = "RETAIN";

    /** 页面从知识索引删除的同步操作。 */
    private static final String SYNC_OPERATION_DELETE = "DELETE";

    /** 等待同步的任务状态。 */
    private static final String SYNC_STATUS_PENDING = "PENDING";

    /** 正在同步的任务状态。 */
    private static final String SYNC_STATUS_RUNNING = "RUNNING";

    /** 同步成功状态。 */
    private static final String SYNC_STATUS_SYNCED = "SYNCED";

    /** 同步失败状态。 */
    private static final String SYNC_STATUS_FAILED = "FAILED";

    /** 页面正文在搜索摘要中保留的最大长度。 */
    private static final int SNIPPET_LENGTH = 220;

    /** 时间返回格式与平台其他 DTO 保持一致。 */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** slug 清洗时允许保留的字符。 */
    private static final Pattern SLUG_UNSAFE_PATTERN = Pattern.compile("[^a-z0-9\\p{IsHan}-]+");

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final WikiPageRepository wikiPageRepository;
    private final WikiPageVersionRepository wikiPageVersionRepository;
    private final WikiPageAccessRepository wikiPageAccessRepository;
    private final WikiPageSyncTaskRepository wikiPageSyncTaskRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final HindsightClientService hindsightClientService;
    private final WikiKnowledgeSearchService wikiKnowledgeSearchService;
    private final WikiSyncQueuePublisher wikiSyncQueuePublisher;

    @Autowired
    public WikiPageService(ProjectRepository projectRepository,
                           UserRepository userRepository,
                           WikiPageRepository wikiPageRepository,
                           WikiPageVersionRepository wikiPageVersionRepository,
                           WikiPageAccessRepository wikiPageAccessRepository,
                           WikiPageSyncTaskRepository wikiPageSyncTaskRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           HindsightClientService hindsightClientService,
                           WikiKnowledgeSearchService wikiKnowledgeSearchService,
                           WikiSyncQueuePublisher wikiSyncQueuePublisher) {
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
        this.wikiPageRepository = wikiPageRepository;
        this.wikiPageVersionRepository = wikiPageVersionRepository;
        this.wikiPageAccessRepository = wikiPageAccessRepository;
        this.wikiPageSyncTaskRepository = wikiPageSyncTaskRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.hindsightClientService = hindsightClientService;
        this.wikiKnowledgeSearchService = wikiKnowledgeSearchService;
        this.wikiSyncQueuePublisher = wikiSyncQueuePublisher;
    }

    /**
     * 兼容旧测试构造方式。
     */
    public WikiPageService(ProjectRepository projectRepository,
                           UserRepository userRepository,
                           WikiPageRepository wikiPageRepository,
                           WikiPageVersionRepository wikiPageVersionRepository,
                           WikiPageAccessRepository wikiPageAccessRepository,
                           WikiPageSyncTaskRepository wikiPageSyncTaskRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           HindsightClientService hindsightClientService) {
        this(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService,
                null,
                null
        );
    }

    /**
     * 兼容旧测试构造方式，同时允许测试注入 Wiki 同步队列发布器。
     */
    public WikiPageService(ProjectRepository projectRepository,
                           UserRepository userRepository,
                           WikiPageRepository wikiPageRepository,
                           WikiPageVersionRepository wikiPageVersionRepository,
                           WikiPageAccessRepository wikiPageAccessRepository,
                           WikiPageSyncTaskRepository wikiPageSyncTaskRepository,
                           ProjectDataPermissionService projectDataPermissionService,
                           HindsightClientService hindsightClientService,
                           WikiKnowledgeSearchService wikiKnowledgeSearchService) {
        this(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService,
                wikiKnowledgeSearchService,
                null
        );
    }

    /**
     * 读取当前用户在项目内可见的 Wiki 页面树。
     */
    public List<WikiPageTreeNode> getPageTree(Long projectId) {
        ProjectEntity project = requireProject(projectId);
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        List<WikiPageEntity> visiblePages = wikiPageRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(project.getId()).stream()
                .filter(page -> canViewPage(page, scope))
                .toList();
        return buildTree(visiblePages, scope);
    }

    /**
     * 按 slug 读取 Wiki 页面详情。
     */
    @Transactional
    public WikiPageDetail getPageBySlug(Long projectId, String slug) {
        WikiPageEntity page = wikiPageRepository.findByProject_IdAndSlugIgnoreCase(projectId, defaultString(slug))
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面不存在"));
        return getPageDetail(projectId, page.getId());
    }

    /**
     * 按 ID 读取 Wiki 页面详情。
     */
    @Transactional
    public WikiPageDetail getPageDetail(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        return toDetail(page, safeRelatedPages(page, 4));
    }

    /**
     * 当项目 Wiki 页面同步失败时，允许页面维护者手动重新排队知识索引任务。
     * 这里仍复用既有调度器消费，避免同步调用把页面操作阻塞到外部依赖完成。
     */
    @Transactional
    public WikiPageDetail retryPageSync(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageEditable(page);
        requeueRetainTask(page);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageEntity saved = wikiPageRepository.save(page);
        return toDetail(saved, safeRelatedPages(saved, 4));
    }

    /**
     * 创建 Wiki 页面，并立即生成 v1 版本和知识索引同步任务。
     */
    @Transactional
    public WikiPageDetail createPage(Long projectId, CreateWikiPageRequest request) {
        ProjectEntity project = requireProject(projectId);
        projectDataPermissionService.requireProjectEditable(project);
        UserEntity currentUser = requireCurrentUser();
        WikiPageEntity parentPage = request.parentPageId() == null ? null : requirePage(projectId, request.parentPageId());

        WikiPageEntity page = new WikiPageEntity();
        page.setProject(project);
        page.setParentPage(parentPage);
        page.setTitle(defaultString(request.title()));
        page.setSlug(generateUniqueSlug(project.getId(), request.title(), null));
        page.setContent(defaultString(request.content()));
        page.setVisibilityScope(normalizeVisibilityScope(request.visibilityScope()));
        page.setAuthorUser(currentUser);
        page.setCurrentVersionNumber(1);
        page.setSortOrder(wikiPageRepository.findMaxSortOrder(projectId, request.parentPageId()) + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        WikiPageEntity saved = wikiPageRepository.save(page);
        saveAccessRules(saved, request.specificViewerUserIds(), request.specificEditorUserIds());
        createVersion(saved, 1, currentUser, "创建页面");
        enqueueRetainTask(saved);
        return toDetail(saved, List.of());
    }

    /**
     * 更新 Wiki 页面，并追加新版本。
     */
    @Transactional
    public WikiPageDetail updatePage(Long projectId, Long pageId, UpdateWikiPageRequest request) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageEditable(page);
        UserEntity currentUser = requireCurrentUser();
        WikiPageEntity parentPage = request.parentPageId() == null ? null : requirePage(projectId, request.parentPageId());
        ensureNoParentCycle(page, parentPage);

        Long oldParentId = page.getParentPage() == null ? null : page.getParentPage().getId();
        Long newParentId = parentPage == null ? null : parentPage.getId();
        page.setParentPage(parentPage);
        if (!Objects.equals(oldParentId, newParentId)) {
            page.setSortOrder(wikiPageRepository.findMaxSortOrder(projectId, newParentId) + 1);
        }
        page.setTitle(defaultString(request.title()));
        page.setContent(defaultString(request.content()));
        page.setVisibilityScope(normalizeVisibilityScope(request.visibilityScope()));
        page.setCurrentVersionNumber(page.getCurrentVersionNumber() + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageEntity saved = wikiPageRepository.save(page);
        saveAccessRules(saved, request.specificViewerUserIds(), request.specificEditorUserIds());
        createVersion(saved, saved.getCurrentVersionNumber(), currentUser, defaultString(request.changeSummary()).isBlank() ? "更新页面" : request.changeSummary());
        enqueueRetainTask(saved);
        return toDetail(saved, safeRelatedPages(saved, 4));
    }

    /**
     * 删除 Wiki 页面；如果存在子页面则拒绝删除。
     */
    @Transactional
    public void deletePage(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageEditable(page);
        if (wikiPageRepository.existsByParentPage_Id(page.getId())) {
            throw new IllegalArgumentException("当前页面存在子页面，请先移动或删除子页面");
        }
        enqueueDeleteTask(page);
        wikiPageRepository.delete(page);
    }

    /**
     * 读取页面版本历史。
     */
    public List<WikiPageVersionSummary> listVersions(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        return wikiPageVersionRepository.findAllByPage_IdOrderByVersionNumberDesc(page.getId()).stream()
                .map(this::toVersionSummary)
                .toList();
    }

    /**
     * 读取页面指定版本内容。
     */
    public WikiPageVersionSummary getVersion(Long projectId, Long pageId, Integer versionNumber) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        return wikiPageVersionRepository.findByPage_IdAndVersionNumber(page.getId(), versionNumber)
                .map(this::toVersionSummary)
                .orElseThrow(() -> new NoSuchElementException("Wiki 版本不存在"));
    }

    /**
     * 恢复历史版本，恢复操作本身会生成一个新的当前版本。
     */
    @Transactional
    public WikiPageDetail restoreVersion(Long projectId, Long pageId, Integer versionNumber) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageEditable(page);
        UserEntity currentUser = requireCurrentUser();
        WikiPageVersionEntity version = wikiPageVersionRepository.findByPage_IdAndVersionNumber(page.getId(), versionNumber)
                .orElseThrow(() -> new NoSuchElementException("Wiki 版本不存在"));
        page.setTitle(version.getTitle());
        page.setContent(version.getContent());
        page.setCurrentVersionNumber(page.getCurrentVersionNumber() + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageEntity saved = wikiPageRepository.save(page);
        createVersion(saved, saved.getCurrentVersionNumber(), currentUser, "恢复版本 v" + versionNumber);
        enqueueRetainTask(saved);
        return toDetail(saved, safeRelatedPages(saved, 4));
    }

    /**
     * 项目内关键词搜索，按当前用户页面权限过滤。
     */
    public List<WikiPageSummary> searchPages(Long projectId, String keyword) {
        ProjectEntity project = requireProject(projectId);
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        String normalizedKeyword = defaultString(keyword).toLowerCase(Locale.ROOT);
        return wikiPageRepository.findAllByProject_IdOrderByUpdatedAtDescIdDesc(project.getId(), PageRequest.of(0, 30)).stream()
                .filter(page -> canViewPage(page, scope))
                .filter(page -> normalizedKeyword.isBlank()
                        || containsAny(page.getTitle(), normalizedKeyword)
                        || containsAny(page.getSlug(), normalizedKeyword)
                        || containsAny(page.getContent(), normalizedKeyword))
                .limit(10)
                .map(page -> toSummary(page, scope))
                .toList();
    }

    /**
     * 项目内语义搜索，优先使用知识索引召回，失败时自动回退关键词搜索。
     */
    public List<WikiSemanticSearchResult> semanticSearchPages(Long projectId, String query) {
        requireProject(projectId);
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        try {
            List<WikiPageEntity> keywordCandidates = wikiPageRepository.findAllByProject_IdOrderByUpdatedAtDescIdDesc(projectId, PageRequest.of(0, 30)).stream()
                    .filter(page -> canViewPage(page, scope))
                    .filter(page -> defaultString(query).isBlank()
                            || containsAny(page.getTitle(), defaultString(query).toLowerCase(Locale.ROOT))
                            || containsAny(page.getSlug(), defaultString(query).toLowerCase(Locale.ROOT))
                            || containsAny(page.getContent(), defaultString(query).toLowerCase(Locale.ROOT)))
                    .limit(12)
                    .toList();
            List<WikiKnowledgeSearchService.WikiRankedPageHit> hits = wikiKnowledgeSearchService == null
                    ? List.of()
                    : wikiKnowledgeSearchService.hybridSearchProjectPages(projectId, query, keywordCandidates, 12);
            Map<Long, WikiKnowledgeSearchService.WikiRankedPageHit> hitByPageId = new LinkedHashMap<>();
            for (WikiKnowledgeSearchService.WikiRankedPageHit hit : hits) {
                if (hit.pageId() != null) {
                    hitByPageId.putIfAbsent(hit.pageId(), hit);
                }
            }
            if (hitByPageId.isEmpty()) {
                return keywordFallbackResults(projectId, query);
            }
            List<Long> pageIds = new ArrayList<>(hitByPageId.keySet());
            return wikiPageRepository.findAllByProject_IdAndIdIn(projectId, pageIds).stream()
                    .filter(page -> canViewPage(page, scope))
                    .sorted(Comparator.comparingInt(page -> pageIds.indexOf(page.getId())))
                    .map(page -> {
                        WikiKnowledgeSearchService.WikiRankedPageHit hit = hitByPageId.get(page.getId());
                        return new WikiSemanticSearchResult(toSummary(page, scope), hit.score(), abbreviate(firstText(hit.snippet(), page.getContent()), SNIPPET_LENGTH));
                    })
                    .toList();
        } catch (RuntimeException exception) {
            return keywordFallbackResults(projectId, query);
        }
    }

    /**
     * 读取当前页面的相关 Wiki 页面。
     */
    public List<WikiPageSummary> relatedPages(Long projectId, Long pageId, int limit) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        String query = page.getTitle() + "\n" + abbreviate(page.getContent(), 800);
        return semanticSearchPages(projectId, query).stream()
                .map(WikiSemanticSearchResult::page)
                .filter(item -> !Objects.equals(item.id(), page.getId()))
                .limit(Math.max(1, Math.min(limit, 10)))
                .toList();
    }

    /**
     * 读取指定页面摘要，供 Assistant 上下文装配复用。
     */
    public WikiPageSummary getPageSummaryForAssistant(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        return toSummary(page, projectDataPermissionService.requireCurrentScope());
    }

    /**
     * 读取指定页面详情，供 Assistant 工具执行复用。
     */
    public WikiPageDetail getPageDetailForAssistant(Long projectId, Long pageId) {
        return getPageDetail(projectId, pageId);
    }

    /**
     * 读取当前用户可见 Wiki 页面所属的项目名称，供 Assistant 文本上下文使用。
     */
    public String getProjectNameForVisiblePage(Long projectId, Long pageId) {
        WikiPageEntity page = requirePage(projectId, pageId);
        requirePageViewable(page);
        return page.getProject().getName();
    }

    /**
     * 补偿发布一批 Wiki 知识索引同步任务。
     * 业务意图：保存页面后的事务提交发布失败、RabbitMQ 短暂不可用或服务重启后，仍能靠数据库任务表补发信号。
     */
    @Transactional
    public void processPendingSyncTasks() {
        List<WikiPageSyncTaskEntity> tasks = wikiPageSyncTaskRepository
                .findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                        SYNC_STATUS_PENDING,
                        LocalDateTime.now(),
                        PageRequest.of(0, 5, Sort.by(Sort.Direction.ASC, "nextAttemptAt", "id"))
                );
        for (WikiPageSyncTaskEntity task : tasks) {
            publishSyncTaskNow(task.getId());
        }
    }

    /**
     * 供逻辑图谱服务读取项目内 Wiki 页面。
     */
    public List<WikiPageEntity> listProjectPagesForGraph(Long projectId) {
        return wikiPageRepository.findAllByProject_IdOrderBySortOrderAscIdAsc(projectId);
    }

    /**
     * 供逻辑图谱服务读取页面版本数量。
     */
    public long countPageVersions(Long pageId) {
        return wikiPageVersionRepository.countByPage_Id(pageId);
    }

    /**
     * Wiki 同步 MQ 消费入口。
     * 业务意图：先通过数据库状态条件原子领取任务，重复消息和多实例竞争领取失败即跳过。
     */
    @Transactional
    public boolean consumeQueuedSyncTask(Long syncTaskId, boolean retryMessage) {
        if (syncTaskId == null) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now();
        int claimed = wikiPageSyncTaskRepository.claimQueuedTask(
                syncTaskId,
                SYNC_STATUS_PENDING,
                SYNC_STATUS_RUNNING,
                now,
                now
        );
        if (claimed == 0) {
            return false;
        }
        WikiPageSyncTaskEntity task = wikiPageSyncTaskRepository.findById(syncTaskId)
                .orElseThrow(() -> new NoSuchElementException("Wiki 同步任务不存在: " + syncTaskId));
        processSyncTask(task);
        return true;
    }

    @Transactional
    public void markQueuedSyncTaskFailed(Long syncTaskId, String errorMessage) {
        if (syncTaskId == null) {
            return;
        }
        wikiPageSyncTaskRepository.findById(syncTaskId).ifPresent(task -> {
            String message = abbreviate(errorMessage, 1000);
            task.setStatus(SYNC_STATUS_FAILED);
            task.setLastError(message);
            if (task.getPage() != null) {
                task.getPage().setSyncStatus(SYNC_STATUS_FAILED);
                task.getPage().setLastSyncError(message);
                wikiPageRepository.save(task.getPage());
            }
            wikiPageSyncTaskRepository.save(task);
        });
    }

    private void processSyncTask(WikiPageSyncTaskEntity task) {
        try {
            if (SYNC_OPERATION_DELETE.equalsIgnoreCase(task.getOperation())) {
                if (wikiKnowledgeSearchService != null) {
                    wikiKnowledgeSearchService.deleteProjectPage(task.getProject().getId(), parsePageIdFromDocumentId(task.getDocumentId()));
                }
            } else {
                WikiPageEntity page = task.getPage();
                if (page == null) {
                    throw new IllegalStateException("Wiki 页面不存在，无法同步到 Wiki 知识索引");
                }
                if (wikiKnowledgeSearchService != null) {
                    wikiKnowledgeSearchService.indexProjectPage(page);
                }
                page.setSyncStatus(SYNC_STATUS_SYNCED);
                page.setLastSyncedAt(LocalDateTime.now());
                page.setLastSyncError("");
                wikiPageRepository.save(page);
            }
            task.setStatus(SYNC_STATUS_SYNCED);
            task.setLastError("");
        } catch (RuntimeException exception) {
            handleSyncFailure(task, exception);
        }
        wikiPageSyncTaskRepository.save(task);
    }

    private void handleSyncFailure(WikiPageSyncTaskEntity task, RuntimeException exception) {
        String message = abbreviate(exception.getMessage(), 1000);
        task.setLastError(message);
        if (task.getAttemptCount() >= task.getMaxAttempts()) {
            task.setStatus(SYNC_STATUS_FAILED);
        } else {
            task.setStatus(SYNC_STATUS_PENDING);
            task.setNextAttemptAt(LocalDateTime.now().plus(resolveBackoff(task.getAttemptCount())));
        }
        if (task.getPage() != null) {
            task.getPage().setSyncStatus(SYNC_STATUS_FAILED);
            task.getPage().setLastSyncError(message);
            wikiPageRepository.save(task.getPage());
        }
    }

    private Duration resolveBackoff(int attemptCount) {
        return switch (attemptCount) {
            case 1 -> Duration.ofMinutes(1);
            case 2 -> Duration.ofMinutes(5);
            case 3 -> Duration.ofMinutes(30);
            case 4 -> Duration.ofHours(2);
            default -> Duration.ofHours(12);
        };
    }

    private List<WikiSemanticSearchResult> keywordFallbackResults(Long projectId, String query) {
        return searchPages(projectId, query).stream()
                .map(page -> new WikiSemanticSearchResult(page, null, "关键词匹配结果"))
                .toList();
    }

    private List<WikiPageSummary> safeRelatedPages(WikiPageEntity page, int limit) {
        try {
            return relatedPages(page.getProject().getId(), page.getId(), limit);
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private ProjectEntity requireProject(Long projectId) {
        if (projectId == null) {
            throw new IllegalArgumentException("项目 ID 不能为空");
        }
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
    }

    private WikiPageEntity requirePage(Long projectId, Long pageId) {
        if (pageId == null) {
            throw new IllegalArgumentException("Wiki 页面 ID 不能为空");
        }
        return wikiPageRepository.findByProject_IdAndId(projectId, pageId)
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面不存在"));
    }

    private UserEntity requireCurrentUser() {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        return userRepository.findById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("当前用户不存在"));
    }

    private void requirePageViewable(WikiPageEntity page) {
        if (!canViewPage(page, projectDataPermissionService.requireCurrentScope())) {
            throw new ForbiddenException("无权访问当前 Wiki 页面");
        }
    }

    private void requirePageEditable(WikiPageEntity page) {
        if (!canEditPage(page, projectDataPermissionService.requireCurrentScope())) {
            throw new ForbiddenException("无权维护当前 Wiki 页面");
        }
    }

    private boolean canViewPage(WikiPageEntity page, ProjectDataPermissionService.ProjectDataScope scope) {
        if (page == null || scope == null) {
            return false;
        }
        if (VISIBILITY_PUBLIC.equalsIgnoreCase(page.getVisibilityScope())) {
            return true;
        }
        if (canEditPage(page, scope)) {
            return true;
        }
        if (VISIBILITY_PROJECT_MEMBERS.equalsIgnoreCase(page.getVisibilityScope())) {
            return projectDataPermissionService.isProjectVisible(page.getProject(), scope);
        }
        return hasAccess(page, scope.userId(), ACCESS_VIEW) || hasAccess(page, scope.userId(), ACCESS_EDIT);
    }

    private boolean canEditPage(WikiPageEntity page, ProjectDataPermissionService.ProjectDataScope scope) {
        if (page == null || scope == null) {
            return false;
        }
        if (projectDataPermissionService.canEditProject(page.getProject(), scope)) {
            return true;
        }
        if (page.getAuthorUser() != null && Objects.equals(page.getAuthorUser().getId(), scope.userId())) {
            return true;
        }
        return hasAccess(page, scope.userId(), ACCESS_EDIT);
    }

    private boolean hasAccess(WikiPageEntity page, Long userId, String permission) {
        if (page.getId() == null || userId == null) {
            return false;
        }
        return wikiPageAccessRepository.findAllByPage_IdAndUser_Id(page.getId(), userId).stream()
                .anyMatch(access -> permission.equalsIgnoreCase(access.getPermission()));
    }

    private void saveAccessRules(WikiPageEntity page, List<Long> viewerUserIds, List<Long> editorUserIds) {
        wikiPageAccessRepository.deleteAllByPage_Id(page.getId());
        LinkedHashSet<Long> viewers = new LinkedHashSet<>(viewerUserIds == null ? List.of() : viewerUserIds);
        LinkedHashSet<Long> editors = new LinkedHashSet<>(editorUserIds == null ? List.of() : editorUserIds);
        viewers.addAll(editors);
        for (Long viewerId : viewers) {
            saveAccess(page, viewerId, ACCESS_VIEW);
        }
        for (Long editorId : editors) {
            saveAccess(page, editorId, ACCESS_EDIT);
        }
    }

    private void saveAccess(WikiPageEntity page, Long userId, String permission) {
        if (userId == null) {
            return;
        }
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("指定用户不存在: " + userId));
        WikiPageAccessEntity access = new WikiPageAccessEntity();
        access.setPage(page);
        access.setUser(user);
        access.setPermission(permission);
        wikiPageAccessRepository.save(access);
    }

    private void createVersion(WikiPageEntity page, int versionNumber, UserEntity user, String changeSummary) {
        WikiPageVersionEntity version = new WikiPageVersionEntity();
        version.setPage(page);
        version.setVersionNumber(versionNumber);
        version.setTitle(page.getTitle());
        version.setContent(page.getContent());
        version.setAuthorUser(user);
        version.setChangeSummary(abbreviate(defaultString(changeSummary), 500));
        wikiPageVersionRepository.save(version);
    }

    private void enqueueRetainTask(WikiPageEntity page) {
        WikiPageSyncTaskEntity task = new WikiPageSyncTaskEntity();
        task.setPage(page);
        task.setProject(page.getProject());
        task.setOperation(SYNC_OPERATION_RETAIN);
        task.setDocumentId(documentId(page.getId()));
        task.setStatus(SYNC_STATUS_PENDING);
        WikiPageSyncTaskEntity saved = wikiPageSyncTaskRepository.save(task);
        publishSyncTaskAfterCommit(saved.getId());
    }

    /**
     * 手动重新同步时复用最近一次 retain 任务，重置回退计数与调度时间。
     */
    private void requeueRetainTask(WikiPageEntity page) {
        WikiPageSyncTaskEntity task = wikiPageSyncTaskRepository
                .findFirstByPage_IdAndOperationOrderByIdDesc(page.getId(), SYNC_OPERATION_RETAIN)
                .orElseGet(WikiPageSyncTaskEntity::new);
        task.setPage(page);
        task.setProject(page.getProject());
        task.setOperation(SYNC_OPERATION_RETAIN);
        task.setDocumentId(documentId(page.getId()));
        task.setStatus(SYNC_STATUS_PENDING);
        task.setAttemptCount(0);
        task.setNextAttemptAt(LocalDateTime.now());
        task.setLastError("");
        WikiPageSyncTaskEntity saved = wikiPageSyncTaskRepository.save(task);
        publishSyncTaskAfterCommit(saved.getId());
    }

    private void enqueueDeleteTask(WikiPageEntity page) {
        WikiPageSyncTaskEntity task = new WikiPageSyncTaskEntity();
        task.setProject(page.getProject());
        task.setOperation(SYNC_OPERATION_DELETE);
        task.setDocumentId(documentId(page.getId()));
        task.setStatus(SYNC_STATUS_PENDING);
        WikiPageSyncTaskEntity saved = wikiPageSyncTaskRepository.save(task);
        publishSyncTaskAfterCommit(saved.getId());
    }

    private void publishSyncTaskAfterCommit(Long syncTaskId) {
        if (wikiSyncQueuePublisher != null) {
            wikiSyncQueuePublisher.publishAfterCommit(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI, syncTaskId);
        }
    }

    private void publishSyncTaskNow(Long syncTaskId) {
        if (wikiSyncQueuePublisher != null) {
            wikiSyncQueuePublisher.publishNow(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI, syncTaskId);
        }
    }

    private void ensureNoParentCycle(WikiPageEntity page, WikiPageEntity parentPage) {
        WikiPageEntity cursor = parentPage;
        while (cursor != null) {
            if (Objects.equals(cursor.getId(), page.getId())) {
                throw new IllegalArgumentException("父页面不能选择自己或自己的子页面");
            }
            cursor = cursor.getParentPage();
        }
    }

    private List<WikiPageTreeNode> buildTree(List<WikiPageEntity> pages, ProjectDataPermissionService.ProjectDataScope scope) {
        Map<Long, List<WikiPageEntity>> childrenByParent = new LinkedHashMap<>();
        Set<Long> visibleIds = new LinkedHashSet<>();
        for (WikiPageEntity page : pages) {
            visibleIds.add(page.getId());
        }
        for (WikiPageEntity page : pages) {
            Long parentId = page.getParentPage() == null || !visibleIds.contains(page.getParentPage().getId())
                    ? null
                    : page.getParentPage().getId();
            childrenByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(page);
        }
        return buildTreeNodes(null, childrenByParent, scope);
    }

    private List<WikiPageTreeNode> buildTreeNodes(Long parentId,
                                                  Map<Long, List<WikiPageEntity>> childrenByParent,
                                                  ProjectDataPermissionService.ProjectDataScope scope) {
        return childrenByParent.getOrDefault(parentId, List.of()).stream()
                .map(page -> new WikiPageTreeNode(
                        page.getId(),
                        parentId,
                        page.getTitle(),
                        page.getSlug(),
                        page.getVisibilityScope(),
                        canEditPage(page, scope),
                        buildTreeNodes(page.getId(), childrenByParent, scope)
                ))
                .toList();
    }

    private WikiPageDetail toDetail(WikiPageEntity page, List<WikiPageSummary> relatedPages) {
        ProjectDataPermissionService.ProjectDataScope scope = projectDataPermissionService.requireCurrentScope();
        AccessLists accessLists = readAccessLists(page.getId());
        return new WikiPageDetail(
                page.getId(),
                page.getProject().getId(),
                page.getParentPage() == null ? null : page.getParentPage().getId(),
                page.getTitle(),
                page.getSlug(),
                page.getContent(),
                page.getVisibilityScope(),
                page.getSortOrder(),
                page.getCurrentVersionNumber(),
                page.getSyncStatus(),
                formatTime(page.getLastSyncedAt()),
                defaultString(page.getLastSyncError()),
                userDisplayName(page.getAuthorUser()),
                canViewPage(page, scope),
                canEditPage(page, scope),
                accessLists.viewerUserIds(),
                accessLists.editorUserIds(),
                relatedPages,
                formatTime(page.getCreatedAt()),
                formatTime(page.getUpdatedAt())
        );
    }

    private WikiPageSummary toSummary(WikiPageEntity page, ProjectDataPermissionService.ProjectDataScope scope) {
        return new WikiPageSummary(
                page.getId(),
                page.getProject().getId(),
                page.getParentPage() == null ? null : page.getParentPage().getId(),
                page.getTitle(),
                page.getSlug(),
                page.getVisibilityScope(),
                page.getSortOrder(),
                page.getCurrentVersionNumber(),
                page.getSyncStatus(),
                userDisplayName(page.getAuthorUser()),
                canViewPage(page, scope),
                canEditPage(page, scope),
                wikiPageRepository.existsByParentPage_Id(page.getId()),
                formatTime(page.getCreatedAt()),
                formatTime(page.getUpdatedAt())
        );
    }

    private WikiPageVersionSummary toVersionSummary(WikiPageVersionEntity version) {
        return new WikiPageVersionSummary(
                version.getId(),
                version.getPage().getId(),
                version.getVersionNumber(),
                version.getTitle(),
                version.getContent(),
                userDisplayName(version.getAuthorUser()),
                version.getChangeSummary(),
                formatTime(version.getCreatedAt())
        );
    }

    private AccessLists readAccessLists(Long pageId) {
        LinkedHashSet<Long> viewers = new LinkedHashSet<>();
        LinkedHashSet<Long> editors = new LinkedHashSet<>();
        for (WikiPageAccessEntity access : wikiPageAccessRepository.findAllByPage_Id(pageId)) {
            if (ACCESS_EDIT.equalsIgnoreCase(access.getPermission())) {
                editors.add(access.getUser().getId());
            }
            if (ACCESS_VIEW.equalsIgnoreCase(access.getPermission())) {
                viewers.add(access.getUser().getId());
            }
        }
        return new AccessLists(List.copyOf(viewers), List.copyOf(editors));
    }

    private String generateUniqueSlug(Long projectId, String title, Long currentPageId) {
        String baseSlug = toSlug(title);
        String candidate = baseSlug;
        int index = 2;
        while (currentPageId == null
                ? wikiPageRepository.existsByProject_IdAndSlugIgnoreCase(projectId, candidate)
                : wikiPageRepository.existsByProject_IdAndSlugIgnoreCaseAndIdNot(projectId, candidate, currentPageId)) {
            candidate = baseSlug + "-" + index;
            index++;
        }
        return candidate;
    }

    private String toSlug(String title) {
        String normalized = Normalizer.normalize(defaultString(title), Normalizer.Form.NFKC)
                .trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-");
        normalized = SLUG_UNSAFE_PATTERN.matcher(normalized).replaceAll("-");
        normalized = normalized.replaceAll("-+", "-").replaceAll("^-|-$", "");
        if (normalized.isBlank()) {
            normalized = "wiki-page";
        }
        return normalized.length() > 180 ? normalized.substring(0, 180).replaceAll("-$", "") : normalized;
    }

    private String normalizeVisibilityScope(String value) {
        String scope = defaultString(value).toUpperCase(Locale.ROOT);
        if (scope.isBlank()) {
            return VISIBILITY_PROJECT_MEMBERS;
        }
        return switch (scope) {
            case VISIBILITY_PUBLIC, VISIBILITY_PROJECT_MEMBERS, VISIBILITY_SPECIFIC_USERS -> scope;
            default -> throw new IllegalArgumentException("不支持的 Wiki 可见范围: " + value);
        };
    }

    private String buildBreadcrumb(WikiPageEntity page) {
        List<String> names = new ArrayList<>();
        WikiPageEntity cursor = page;
        while (cursor != null) {
            names.add(0, cursor.getTitle());
            cursor = cursor.getParentPage();
        }
        return String.join(" / ", names);
    }

    private Long parsePageIdFromDocumentId(String documentId) {
        if (!StringUtils.hasText(documentId) || !documentId.startsWith("wiki-page:")) {
            return null;
        }
        try {
            return Long.parseLong(documentId.substring("wiki-page:".length()));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String documentId(Long pageId) {
        return "wiki-page:" + pageId;
    }

    private boolean containsAny(String value, String keyword) {
        return defaultString(value).toLowerCase(Locale.ROOT).contains(defaultString(keyword).toLowerCase(Locale.ROOT));
    }

    private String userDisplayName(UserEntity user) {
        if (user == null) {
            return "";
        }
        return StringUtils.hasText(user.getNickname()) ? user.getNickname() : user.getUsername();
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? "" : TIME_FORMATTER.format(time);
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstText(String preferred, String fallback) {
        return StringUtils.hasText(preferred) ? preferred : fallback;
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    /**
     * 页面访问名单拆分结果。
     */
    private record AccessLists(List<Long> viewerUserIds, List<Long> editorUserIds) {
    }
}
