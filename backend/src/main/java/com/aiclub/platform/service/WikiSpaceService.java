package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiPageVersionV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.domain.model.WikiSpaceMemberEntity;
import com.aiclub.platform.dto.WikiDirectorySummary;
import com.aiclub.platform.dto.WikiDirectoryTreeNode;
import com.aiclub.platform.dto.WikiSpaceDetail;
import com.aiclub.platform.dto.WikiSpaceMemberSummary;
import com.aiclub.platform.dto.WikiSpacePageDetail;
import com.aiclub.platform.dto.WikiSpacePageSummary;
import com.aiclub.platform.dto.WikiSpacePageVersionSummary;
import com.aiclub.platform.dto.WikiSpaceSearchResult;
import com.aiclub.platform.dto.WikiSpaceSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.WikiImportSourceSummary;
import com.aiclub.platform.dto.request.CreateWikiDirectoryRequest;
import com.aiclub.platform.dto.request.CreateWikiImportPageRequest;
import com.aiclub.platform.dto.request.CreateWikiSpacePageRequest;
import com.aiclub.platform.dto.request.CreateWikiSpaceRequest;
import com.aiclub.platform.dto.request.ReplaceWikiSpaceMembersRequest;
import com.aiclub.platform.dto.request.UpdateWikiDirectoryRequest;
import com.aiclub.platform.dto.request.UpdateWikiSpacePageRequest;
import com.aiclub.platform.dto.request.UpdateWikiSpaceRequest;
import com.aiclub.platform.dto.request.WikiImportPreviewRequest;
import com.aiclub.platform.dto.request.WikiSpaceMemberItemRequest;
import com.aiclub.platform.exception.ForbiddenException;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.repository.WikiDirectoryRepository;
import com.aiclub.platform.repository.WikiPageSyncTaskV2Repository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.repository.WikiPageVersionV2Repository;
import com.aiclub.platform.repository.WikiSpaceMemberRepository;
import com.aiclub.platform.repository.WikiSpaceRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
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
 * 空间化 Wiki 核心服务，负责空间、目录、页面、搜索和 Hindsight 同步。
 */
@Service
@Transactional(readOnly = true)
public class WikiSpaceService {

    /** 仅空间成员可读。 */
    public static final String READ_SCOPE_MEMBERS_ONLY = "MEMBERS_ONLY";

    /** 所有登录用户可读。 */
    public static final String READ_SCOPE_ALL_LOGGED_IN = "ALL_LOGGED_IN";

    /** 空间管理员。 */
    public static final String ROLE_ADMIN = "ADMIN";

    /** 空间编辑者。 */
    public static final String ROLE_EDITOR = "EDITOR";

    /** 空间查看者。 */
    public static final String ROLE_VIEWER = "VIEWER";

    /** 空间成员默认由手工维护。 */
    public static final String MEMBER_SOURCE_MANUAL = "MANUAL";

    /** 空间成员默认带入绑定项目参与人。 */
    public static final String MEMBER_SOURCE_PROJECT_MEMBERS = "PROJECT_MEMBERS";

    /** 页面待同步。 */
    private static final String SYNC_STATUS_PENDING = "PENDING";

    /** 页面同步成功。 */
    private static final String SYNC_STATUS_SYNCED = "SYNCED";

    /** 页面同步失败。 */
    private static final String SYNC_STATUS_FAILED = "FAILED";

    /** 同步任务运行中。 */
    private static final String SYNC_STATUS_RUNNING = "RUNNING";

    /** 同步写入操作。 */
    private static final String SYNC_OPERATION_RETAIN = "RETAIN";

    /** 同步删除操作。 */
    private static final String SYNC_OPERATION_DELETE = "DELETE";

    /** 时间格式统一与平台其他 DTO 保持一致。 */
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 页面正文搜索片段长度。 */
    private static final int SEARCH_SNIPPET_LENGTH = 240;

    /** slug 中允许保留中文、英文、数字和连字符。 */
    private static final Pattern SLUG_UNSAFE_PATTERN = Pattern.compile("[^a-z0-9\\p{IsHan}-]+");

    private final WikiSpaceRepository wikiSpaceRepository;
    private final WikiSpaceMemberRepository wikiSpaceMemberRepository;
    private final WikiDirectoryRepository wikiDirectoryRepository;
    private final WikiPageV2Repository wikiPageV2Repository;
    private final WikiPageVersionV2Repository wikiPageVersionV2Repository;
    private final WikiPageSyncTaskV2Repository wikiPageSyncTaskV2Repository;
    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final HindsightClientService hindsightClientService;
    private final DocumentAssetService documentAssetService;
    private final DocumentMarkdownService documentMarkdownService;

    public WikiSpaceService(WikiSpaceRepository wikiSpaceRepository,
                            WikiSpaceMemberRepository wikiSpaceMemberRepository,
                            WikiDirectoryRepository wikiDirectoryRepository,
                            WikiPageV2Repository wikiPageV2Repository,
                            WikiPageVersionV2Repository wikiPageVersionV2Repository,
                            WikiPageSyncTaskV2Repository wikiPageSyncTaskV2Repository,
                            UserRepository userRepository,
                            ProjectRepository projectRepository,
                            ProjectDataPermissionService projectDataPermissionService,
                            HindsightClientService hindsightClientService,
                            DocumentAssetService documentAssetService,
                            DocumentMarkdownService documentMarkdownService) {
        this.wikiSpaceRepository = wikiSpaceRepository;
        this.wikiSpaceMemberRepository = wikiSpaceMemberRepository;
        this.wikiDirectoryRepository = wikiDirectoryRepository;
        this.wikiPageV2Repository = wikiPageV2Repository;
        this.wikiPageVersionV2Repository = wikiPageVersionV2Repository;
        this.wikiPageSyncTaskV2Repository = wikiPageSyncTaskV2Repository;
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.hindsightClientService = hindsightClientService;
        this.documentAssetService = documentAssetService;
        this.documentMarkdownService = documentMarkdownService;
    }

    /**
     * 读取当前用户可见的空间列表，可按关键词和项目关联过滤。
     */
    public List<WikiSpaceSummary> listSpaces(String keyword, Boolean mineOnly, Boolean publicOnly, Long projectId) {
        UserContext userContext = requireCurrentUserContext();
        List<WikiSpaceEntity> spaces = wikiSpaceRepository.findAll(Sort.by(Sort.Direction.ASC, "name", "id"));
        return spaces.stream()
                .filter(space -> canViewSpace(space, userContext))
                .filter(space -> !Boolean.TRUE.equals(mineOnly) || memberRole(space.getId(), userContext.userId()) != null)
                .filter(space -> !Boolean.TRUE.equals(publicOnly) || READ_SCOPE_ALL_LOGGED_IN.equalsIgnoreCase(space.getReadScope()))
                .filter(space -> projectId == null || spaceContainsProject(space.getId(), projectId))
                .filter(space -> defaultString(keyword).isBlank()
                        || containsIgnoreCase(space.getName(), keyword)
                        || containsIgnoreCase(space.getDescription(), keyword))
                .map(space -> toSpaceSummary(space, userContext))
                .toList();
    }

    /**
     * 读取空间详情。
     */
    public WikiSpaceDetail getSpaceDetail(Long spaceId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceVisible(space, userContext);
        return toSpaceDetail(space, userContext);
    }

    /**
     * 创建空间，并自动把创建者设为 ADMIN 和默认目录。
     */
    @Transactional
    public WikiSpaceDetail createSpace(CreateWikiSpaceRequest request) {
        UserContext userContext = requireCurrentUserContext();
        ProjectEntity boundProject = request.boundProjectId() == null ? null : requireVisibleProject(request.boundProjectId());
        String memberDefaultSource = normalizeMemberDefaultSource(request.memberDefaultSource(), boundProject);
        WikiSpaceEntity entity = new WikiSpaceEntity();
        entity.setName(defaultString(request.name()));
        entity.setDescription(defaultString(request.description()));
        entity.setReadScope(normalizeReadScope(request.readScope()));
        entity.setBoundProject(boundProject);
        entity.setMemberDefaultSource(memberDefaultSource);
        entity.setCreatorUser(userContext.user());
        WikiSpaceEntity saved = wikiSpaceRepository.save(entity);
        applyDefaultMembers(saved, userContext.user(), boundProject, memberDefaultSource, true);
        ensureDefaultDirectory(saved, userContext.user());
        return toSpaceDetail(saved, userContext);
    }

    /**
     * 更新空间基础信息，仅 ADMIN 或超级管理员可执行。
     */
    @Transactional
    public WikiSpaceDetail updateSpace(Long spaceId, UpdateWikiSpaceRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceManageable(space, userContext);
        Long oldBoundProjectId = space.getBoundProject() == null ? null : space.getBoundProject().getId();
        String oldMemberDefaultSource = normalizeMemberDefaultSource(space.getMemberDefaultSource(), space.getBoundProject());
        ProjectEntity boundProject = request.boundProjectId() == null ? null : requireVisibleProject(request.boundProjectId());
        String memberDefaultSource = normalizeMemberDefaultSource(request.memberDefaultSource(), boundProject);
        space.setName(defaultString(request.name()));
        space.setDescription(defaultString(request.description()));
        space.setReadScope(normalizeReadScope(request.readScope()));
        space.setBoundProject(boundProject);
        space.setMemberDefaultSource(memberDefaultSource);
        WikiSpaceEntity saved = wikiSpaceRepository.save(space);
        boolean projectChanged = !Objects.equals(oldBoundProjectId, boundProject == null ? null : boundProject.getId());
        boolean memberSourceChanged = !Objects.equals(oldMemberDefaultSource, memberDefaultSource);
        if (MEMBER_SOURCE_PROJECT_MEMBERS.equals(memberDefaultSource) && (projectChanged || memberSourceChanged)) {
            applyDefaultMembers(saved, userContext.user(), boundProject, memberDefaultSource, false);
        }
        return toSpaceDetail(saved, userContext);
    }

    /**
     * 删除整个空间及其目录、页面和成员关系。
     */
    @Transactional
    public void deleteSpace(Long spaceId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceManageable(space, userContext);
        wikiSpaceRepository.delete(space);
    }

    /**
     * 读取空间成员列表。
     */
    public List<WikiSpaceMemberSummary> listMembers(Long spaceId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceVisible(space, userContext);
        return wikiSpaceMemberRepository.findAllBySpace_IdOrderByIdAsc(spaceId).stream()
                .map(this::toMemberSummary)
                .toList();
    }

    /**
     * 整体替换空间成员列表，并保证至少保留一个 ADMIN。
     */
    @Transactional
    public List<WikiSpaceMemberSummary> replaceMembers(Long spaceId, ReplaceWikiSpaceMembersRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceManageable(space, userContext);
        List<WikiSpaceMemberItemRequest> members = request.members() == null ? List.of() : request.members();
        if (members.stream().noneMatch(item -> ROLE_ADMIN.equalsIgnoreCase(defaultString(item.memberRole())))) {
            throw new IllegalArgumentException("空间至少需要保留一个管理员");
        }
        wikiSpaceMemberRepository.deleteAllBySpace_Id(spaceId);
        for (WikiSpaceMemberItemRequest item : members) {
            UserEntity user = requireUser(item.userId());
            WikiSpaceMemberEntity member = new WikiSpaceMemberEntity();
            member.setSpace(space);
            member.setUser(user);
            member.setMemberRole(normalizeMemberRole(item.memberRole()));
            wikiSpaceMemberRepository.save(member);
        }
        return listMembers(spaceId);
    }

    /**
     * 读取空间目录树，目录下支持页面多级嵌套。
     */
    public List<WikiDirectoryTreeNode> getDirectoryTree(Long spaceId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceVisible(space, userContext);
        List<WikiDirectoryEntity> directories = wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(spaceId);
        List<WikiPageV2Entity> pages = wikiPageV2Repository.findAllBySpace_IdOrderByUpdatedAtDescIdDesc(spaceId);
        return buildDirectoryTree(directories, pages);
    }

    /**
     * 创建目录，可选绑定一个可访问项目。
     */
    @Transactional
    public WikiDirectorySummary createDirectory(Long spaceId, CreateWikiDirectoryRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity parentDirectory = request.parentDirectoryId() == null ? null : requireDirectory(spaceId, request.parentDirectoryId());
        ProjectEntity boundProject = request.boundProjectId() == null ? null : requireVisibleProject(request.boundProjectId());

        WikiDirectoryEntity entity = new WikiDirectoryEntity();
        entity.setSpace(space);
        entity.setParentDirectory(parentDirectory);
        entity.setName(defaultString(request.name()));
        entity.setSlug(generateUniqueDirectorySlug(spaceId, request.parentDirectoryId(), request.name(), null));
        entity.setContent(defaultString(request.content()));
        entity.setSortOrder(wikiDirectoryRepository.findMaxSortOrder(spaceId, request.parentDirectoryId()) + 1);
        entity.setBoundProject(boundProject);
        entity.setCreatedByUser(userContext.user());
        return toDirectorySummary(wikiDirectoryRepository.save(entity));
    }

    /**
     * 更新目录名称、父级和绑定项目。
     */
    @Transactional
    public WikiDirectorySummary updateDirectory(Long spaceId, Long directoryId, UpdateWikiDirectoryRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity directory = requireDirectory(spaceId, directoryId);
        WikiDirectoryEntity parentDirectory = request.parentDirectoryId() == null ? null : requireDirectory(spaceId, request.parentDirectoryId());
        ensureNoDirectoryCycle(directory, parentDirectory);
        Long oldParentId = directory.getParentDirectory() == null ? null : directory.getParentDirectory().getId();
        Long newParentId = parentDirectory == null ? null : parentDirectory.getId();
        directory.setParentDirectory(parentDirectory);
        if (!Objects.equals(oldParentId, newParentId)) {
            directory.setSortOrder(wikiDirectoryRepository.findMaxSortOrder(spaceId, newParentId) + 1);
        }
        directory.setName(defaultString(request.name()));
        directory.setSlug(generateUniqueDirectorySlug(spaceId, newParentId, request.name(), directoryId));
        directory.setContent(defaultString(request.content()));
        directory.setBoundProject(request.boundProjectId() == null ? null : requireVisibleProject(request.boundProjectId()));
        return toDirectorySummary(wikiDirectoryRepository.save(directory));
    }

    /**
     * 删除目录，要求当前目录没有子目录和页面。
     */
    @Transactional
    public void deleteDirectory(Long spaceId, Long directoryId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity directory = requireDirectory(spaceId, directoryId);
        if (wikiDirectoryRepository.existsByParentDirectory_Id(directoryId)) {
            throw new IllegalArgumentException("当前目录存在子目录，请先删除或移动子目录");
        }
        if (wikiPageV2Repository.existsByDirectory_Id(directoryId)) {
            throw new IllegalArgumentException("当前目录下仍有页面，请先删除或移动页面");
        }
        wikiDirectoryRepository.delete(directory);
    }

    /**
     * 按页面 ID 读取页面详情。
     */
    @Transactional
    public WikiSpacePageDetail getPageDetail(Long spaceId, Long pageId) {
        UserContext userContext = requireCurrentUserContext();
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        requireSpaceVisible(page.getSpace(), userContext);
        return toPageDetail(page, userContext, safeRelatedPages(page, 6));
    }

    /**
     * 按 slug 读取页面详情。
     */
    @Transactional
    public WikiSpacePageDetail getPageBySlug(Long spaceId, String slug) {
        WikiPageV2Entity page = wikiPageV2Repository.findBySpace_IdAndSlugIgnoreCase(spaceId, defaultString(slug))
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面不存在"));
        return getPageDetail(spaceId, page.getId());
    }

    /**
     * 创建空间化 Wiki 页面，并生成 v1 与同步任务。
     */
    @Transactional
    public WikiSpacePageDetail createPage(Long spaceId, CreateWikiSpacePageRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity directory = requireDirectory(spaceId, request.directoryId());
        WikiPageV2Entity parentPage = resolveParentPage(spaceId, directory, request.parentPageId());

        WikiPageV2Entity entity = new WikiPageV2Entity();
        entity.setSpace(space);
        entity.setDirectory(directory);
        entity.setParentPage(parentPage);
        entity.setTitle(defaultString(request.title()));
        entity.setSlug(generateUniquePageSlug(spaceId, request.title(), null));
        entity.setContent(defaultString(request.content()));
        entity.setAuthorUser(userContext.user());
        entity.setCurrentVersionNumber(1);
        entity.setSyncStatus(SYNC_STATUS_PENDING);
        WikiPageV2Entity saved = wikiPageV2Repository.save(entity);
        createPageVersion(saved, 1, userContext.user(), "创建页面");
        enqueueRetainTask(saved);
        return toPageDetail(saved, userContext, List.of());
    }

    /**
     * 预览指定文档资产导入后的 Wiki 内容。
     */
    public DocumentMarkdownResult previewImport(Long spaceId, WikiImportPreviewRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceVisible(space, userContext);
        return documentMarkdownService.convert(
                request.assetId(),
                DocumentMarkdownService.SCENE_WIKI_IMPORT,
                200000,
                buildImportImageDirectory(spaceId, request.assetId())
        );
    }

    /**
     * 从文档资产创建新的 Wiki 页面，并绑定来源文档。
     */
    @Transactional
    public WikiSpacePageDetail importPage(Long spaceId, CreateWikiImportPageRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity directory = requireDirectory(spaceId, request.directoryId());
        WikiPageV2Entity parentPage = resolveParentPage(spaceId, directory, request.parentPageId());
        DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(request.assetId());
        String finalContent = defaultString(request.content());
        if (!StringUtils.hasText(finalContent)) {
            DocumentMarkdownResult converted = documentMarkdownService.convert(
                    asset.getId(),
                    DocumentMarkdownService.SCENE_WIKI_IMPORT,
                    200000,
                    buildImportImageDirectory(spaceId, asset.getId())
            );
            finalContent = defaultString(converted.markdown());
        }

        WikiPageV2Entity entity = new WikiPageV2Entity();
        entity.setSpace(space);
        entity.setDirectory(directory);
        entity.setParentPage(parentPage);
        entity.setTitle(defaultString(request.title()));
        entity.setSlug(generateUniquePageSlug(spaceId, request.title(), null));
        entity.setContent(finalContent);
        entity.setAuthorUser(userContext.user());
        entity.setSourceDocumentAsset(documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, null));
        entity.setCurrentVersionNumber(1);
        entity.setSyncStatus(SYNC_STATUS_PENDING);
        WikiPageV2Entity saved = wikiPageV2Repository.save(entity);
        documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, saved.getId());
        createPageVersion(saved, 1, userContext.user(), "导入文档创建页面");
        enqueueRetainTask(saved);
        return toPageDetail(saved, userContext, List.of());
    }

    /**
     * 更新页面，并新增一个版本。
     */
    @Transactional
    public WikiSpacePageDetail updatePage(Long spaceId, Long pageId, UpdateWikiSpacePageRequest request) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        WikiDirectoryEntity directory = requireDirectory(spaceId, request.directoryId());
        WikiPageV2Entity parentPage = resolveParentPage(spaceId, directory, request.parentPageId());
        ensureNoPageCycle(page, parentPage);
        if (!Objects.equals(page.getDirectory().getId(), directory.getId()) && wikiPageV2Repository.existsByParentPage_Id(pageId)) {
            throw new IllegalArgumentException("当前页面存在子页面，请先调整子页面后再移动目录");
        }

        page.setDirectory(directory);
        page.setParentPage(parentPage);
        page.setTitle(defaultString(request.title()));
        page.setSlug(generateUniquePageSlug(spaceId, request.title(), pageId));
        page.setContent(defaultString(request.content()));
        page.setCurrentVersionNumber(page.getCurrentVersionNumber() + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageV2Entity saved = wikiPageV2Repository.save(page);
        createPageVersion(saved, saved.getCurrentVersionNumber(), userContext.user(), request.changeSummary());
        enqueueRetainTask(saved);
        return toPageDetail(saved, userContext, safeRelatedPages(saved, 6));
    }

    /**
     * 删除页面，并追加 Hindsight 删除任务。
     */
    @Transactional
    public void deletePage(Long spaceId, Long pageId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        if (wikiPageV2Repository.existsByParentPage_Id(pageId)) {
            throw new IllegalArgumentException("当前页面存在子页面，请先删除或移动子页面");
        }
        enqueueDeleteTask(page);
        wikiPageV2Repository.delete(page);
    }

    /**
     * 读取页面版本历史。
     */
    public List<WikiSpacePageVersionSummary> listPageVersions(Long spaceId, Long pageId) {
        UserContext userContext = requireCurrentUserContext();
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        requireSpaceVisible(page.getSpace(), userContext);
        return wikiPageVersionV2Repository.findAllByPage_IdOrderByVersionNumberDesc(pageId).stream()
                .map(this::toPageVersionSummary)
                .toList();
    }

    /**
     * 读取页面指定版本。
     */
    public WikiSpacePageVersionSummary getPageVersion(Long spaceId, Long pageId, Integer versionNumber) {
        UserContext userContext = requireCurrentUserContext();
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        requireSpaceVisible(page.getSpace(), userContext);
        return wikiPageVersionV2Repository.findByPage_IdAndVersionNumber(pageId, versionNumber)
                .map(this::toPageVersionSummary)
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面版本不存在"));
    }

    /**
     * 恢复页面历史版本，并把恢复结果记录为一个新版本。
     */
    @Transactional
    public WikiSpacePageDetail restorePageVersion(Long spaceId, Long pageId, Integer versionNumber) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        WikiPageVersionV2Entity version = wikiPageVersionV2Repository.findByPage_IdAndVersionNumber(pageId, versionNumber)
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面版本不存在"));
        page.setTitle(version.getTitle());
        page.setContent(version.getContent());
        page.setCurrentVersionNumber(page.getCurrentVersionNumber() + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageV2Entity saved = wikiPageV2Repository.save(page);
        createPageVersion(saved, saved.getCurrentVersionNumber(), userContext.user(), "恢复版本 v" + versionNumber);
        enqueueRetainTask(saved);
        return toPageDetail(saved, userContext, safeRelatedPages(saved, 6));
    }

    /**
     * 关键词搜索，支持按空间和绑定项目过滤。
     */
    public List<WikiSpacePageSummary> searchPages(String keyword, Long spaceId, Long projectId) {
        UserContext userContext = requireCurrentUserContext();
        List<WikiPageV2Entity> pages = resolveCandidatePages(spaceId);
        String normalizedKeyword = defaultString(keyword).toLowerCase(Locale.ROOT);
        return pages.stream()
                .filter(page -> canViewSpace(page.getSpace(), userContext))
                .filter(page -> projectId == null || Objects.equals(resolveEffectiveBoundProjectId(page.getDirectory()), projectId))
                .filter(page -> normalizedKeyword.isBlank()
                        || containsIgnoreCase(page.getTitle(), normalizedKeyword)
                        || containsIgnoreCase(page.getSlug(), normalizedKeyword)
                        || containsIgnoreCase(page.getContent(), normalizedKeyword)
                        || containsIgnoreCase(page.getDirectory().getName(), normalizedKeyword))
                .sorted(Comparator.comparing(WikiPageV2Entity::getUpdatedAt).reversed().thenComparing(WikiPageV2Entity::getId).reversed())
                .map(page -> toPageSummary(page, userContext))
                .toList();
    }

    /**
     * 语义搜索，按可见空间逐个召回并聚合结果。
     */
    public List<WikiSpaceSearchResult> semanticSearchPages(String query, Long spaceId, Long projectId) {
        UserContext userContext = requireCurrentUserContext();
        List<WikiSpaceEntity> visibleSpaces = resolveVisibleSpaces(spaceId, userContext);
        LinkedHashMap<Long, WikiSpaceSearchResult> merged = new LinkedHashMap<>();
        for (WikiSpaceEntity space : visibleSpaces) {
            try {
                List<HindsightClientService.WikiRecallHit> hits = hindsightClientService.recallWikiSpaceDocuments(space.getId(), query, 8);
                Map<Long, HindsightClientService.WikiRecallHit> hitByPageId = new LinkedHashMap<>();
                for (HindsightClientService.WikiRecallHit hit : hits) {
                    Long pageId = hit.pageId() == null ? parsePageIdFromDocumentId(hit.documentId()) : hit.pageId();
                    if (pageId != null) {
                        hitByPageId.putIfAbsent(pageId, hit);
                    }
                }
                if (hitByPageId.isEmpty()) {
                    continue;
                }
                List<Long> pageIds = new ArrayList<>(hitByPageId.keySet());
                Map<Long, WikiPageV2Entity> pagesById = new LinkedHashMap<>();
                for (WikiPageV2Entity page : wikiPageV2Repository.findAllByIdIn(pageIds)) {
                    pagesById.put(page.getId(), page);
                }
                for (Long pageId : pageIds) {
                    WikiPageV2Entity page = pagesById.get(pageId);
                    if (page == null) {
                        continue;
                    }
                    if (!Objects.equals(page.getSpace().getId(), space.getId())) {
                        continue;
                    }
                    if (projectId != null && !Objects.equals(resolveEffectiveBoundProjectId(page.getDirectory()), projectId)) {
                        continue;
                    }
                    HindsightClientService.WikiRecallHit hit = hitByPageId.get(page.getId());
                    merged.putIfAbsent(
                            page.getId(),
                            new WikiSpaceSearchResult(
                                    toPageSummary(page, userContext),
                                    hit.score(),
                                    abbreviate(firstText(hit.snippet(), page.getContent()), SEARCH_SNIPPET_LENGTH)
                            )
                    );
                }
            } catch (RuntimeException ignored) {
                // 单个空间召回失败时，继续尝试其它空间。
            }
        }
        if (!merged.isEmpty()) {
            return merged.values().stream()
                    .sorted(Comparator.comparing((WikiSpaceSearchResult item) -> item.score() == null ? Double.NEGATIVE_INFINITY : item.score()).reversed())
                    .toList();
        }
        return searchPages(query, spaceId, projectId).stream()
                .map(page -> new WikiSpaceSearchResult(page, null, "关键词匹配结果"))
                .toList();
    }

    /**
     * 读取相关页面，优先使用语义召回并回退关键词搜索。
     */
    public List<WikiSpacePageSummary> relatedPages(Long spaceId, Long pageId, int limit) {
        WikiPageV2Entity page = requirePage(spaceId, pageId);
        UserContext userContext = requireCurrentUserContext();
        requireSpaceVisible(page.getSpace(), userContext);
        String query = page.getTitle() + "\n" + abbreviate(page.getContent(), 1200);
        return semanticSearchPages(query, spaceId, null).stream()
                .map(WikiSpaceSearchResult::page)
                .filter(item -> !Objects.equals(item.id(), pageId))
                .limit(Math.max(1, Math.min(limit, 12)))
                .toList();
    }

    /**
     * 轮询并处理空间化 Wiki 的 Hindsight 同步任务。
     */
    @Transactional
    public void processPendingSyncTasks() {
        List<WikiPageSyncTaskV2Entity> tasks = wikiPageSyncTaskV2Repository
                .findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                        SYNC_STATUS_PENDING,
                        LocalDateTime.now(),
                        PageRequest.of(0, 5, Sort.by(Sort.Direction.ASC, "nextAttemptAt", "id"))
                );
        for (WikiPageSyncTaskV2Entity task : tasks) {
            processSyncTask(task);
        }
    }

    /**
     * 为知识图谱读取绑定到指定项目的目录和其子树页面。
     */
    public WikiProjectGraphProjection buildProjectGraphProjection(Long projectId) {
        List<WikiDirectoryEntity> boundRoots = wikiDirectoryRepository.findAllByBoundProject_IdOrderBySortOrderAscIdAsc(projectId);
        if (boundRoots.isEmpty()) {
            return new WikiProjectGraphProjection(List.of(), List.of(), List.of());
        }
        LinkedHashMap<Long, WikiSpaceEntity> spaces = new LinkedHashMap<>();
        LinkedHashMap<Long, WikiDirectoryEntity> directories = new LinkedHashMap<>();
        LinkedHashMap<Long, WikiPageV2Entity> pages = new LinkedHashMap<>();
        Map<Long, List<WikiDirectoryEntity>> directoriesBySpace = new LinkedHashMap<>();
        Map<Long, List<WikiPageV2Entity>> pagesBySpace = new LinkedHashMap<>();
        for (WikiDirectoryEntity root : boundRoots) {
            Long spaceId = root.getSpace().getId();
            spaces.putIfAbsent(spaceId, root.getSpace());
            directoriesBySpace.computeIfAbsent(spaceId, ignored -> wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(spaceId));
            pagesBySpace.computeIfAbsent(spaceId, ignored -> wikiPageV2Repository.findAllBySpace_IdOrderByUpdatedAtDescIdDesc(spaceId));
            collectDirectorySubtree(root, directoriesBySpace.get(spaceId), pagesBySpace.get(spaceId), directories, pages);
        }
        return new WikiProjectGraphProjection(
                new ArrayList<>(spaces.values()),
                new ArrayList<>(directories.values()),
                new ArrayList<>(pages.values())
        );
    }

    /**
     * 统计页面版本数量，供知识图谱节点元数据使用。
     */
    public long countPageVersions(Long pageId) {
        return wikiPageVersionV2Repository.countByPage_Id(pageId);
    }

    /**
     * 为自动化场景幂等创建或复用目录，避免需求 PRD 初始化重复建树。
     */
    public WikiDirectoryEntity ensureAutomationDirectory(Long spaceId,
                                                         Long parentDirectoryId,
                                                         String name,
                                                         Long boundProjectId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);

        WikiDirectoryEntity existing = parentDirectoryId == null
                ? wikiDirectoryRepository.findBySpace_IdAndParentDirectoryIsNullAndNameIgnoreCase(spaceId, name).orElse(null)
                : wikiDirectoryRepository.findBySpace_IdAndParentDirectory_IdAndNameIgnoreCase(spaceId, parentDirectoryId, name).orElse(null);
        if (existing != null) {
            if (boundProjectId != null
                    && (existing.getBoundProject() == null || !Objects.equals(existing.getBoundProject().getId(), boundProjectId))) {
                existing.setBoundProject(requireVisibleProject(boundProjectId));
                existing = wikiDirectoryRepository.save(existing);
            }
            return existing;
        }

        WikiDirectoryEntity parentDirectory = parentDirectoryId == null ? null : requireDirectory(spaceId, parentDirectoryId);
        ProjectEntity boundProject = boundProjectId == null ? null : requireVisibleProject(boundProjectId);
        WikiDirectoryEntity entity = new WikiDirectoryEntity();
        entity.setSpace(space);
        entity.setParentDirectory(parentDirectory);
        entity.setName(defaultString(name));
        entity.setSlug(generateUniqueDirectorySlug(spaceId, parentDirectoryId, name, null));
        entity.setContent("");
        entity.setSortOrder(wikiDirectoryRepository.findMaxSortOrder(spaceId, parentDirectoryId) + 1);
        entity.setBoundProject(boundProject);
        entity.setCreatedByUser(userContext.user());
        return wikiDirectoryRepository.save(entity);
    }

    /**
     * 为自动化场景幂等创建页面。
     * 如果目录下已存在同名页面，则直接复用，避免重复生成 PRD 主页面。
     */
    public WikiPageV2Entity createAutomationPage(Long spaceId, Long directoryId, String title, String content) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiDirectoryEntity directory = requireDirectory(spaceId, directoryId);

        WikiPageV2Entity existing = wikiPageV2Repository.findBySpace_IdAndDirectory_IdAndTitleIgnoreCase(spaceId, directoryId, title)
                .orElse(null);
        if (existing != null) {
            return existing;
        }

        WikiPageV2Entity entity = new WikiPageV2Entity();
        entity.setSpace(space);
        entity.setDirectory(directory);
        entity.setParentPage(null);
        entity.setTitle(defaultString(title));
        entity.setSlug(generateUniquePageSlug(spaceId, title, null));
        entity.setContent(defaultString(content));
        entity.setAuthorUser(userContext.user());
        entity.setCurrentVersionNumber(1);
        entity.setSyncStatus(SYNC_STATUS_PENDING);
        WikiPageV2Entity saved = wikiPageV2Repository.save(entity);
        createPageVersion(saved, 1, userContext.user(), "创建页面");
        enqueueRetainTask(saved);
        return saved;
    }

    /**
     * 为自动化场景更新页面正文，仍复用现有版本与 Hindsight 同步链路。
     */
    public WikiPageV2Entity updateAutomationPageContent(Long spaceId, Long pageId, String content, String changeSummary) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
        WikiPageV2Entity page = requirePage(spaceId, pageId);

        page.setContent(defaultString(content));
        page.setCurrentVersionNumber(page.getCurrentVersionNumber() + 1);
        page.setSyncStatus(SYNC_STATUS_PENDING);
        page.setLastSyncError("");
        WikiPageV2Entity saved = wikiPageV2Repository.save(page);
        createPageVersion(saved, saved.getCurrentVersionNumber(), userContext.user(), changeSummary);
        enqueueRetainTask(saved);
        return saved;
    }

    /**
     * 供控制器等边界层显式校验空间编辑权限。
     */
    public void assertCurrentUserCanEditSpace(Long spaceId) {
        UserContext userContext = requireCurrentUserContext();
        WikiSpaceEntity space = requireSpace(spaceId);
        requireSpaceEditable(space, userContext);
    }

    private void processSyncTask(WikiPageSyncTaskV2Entity task) {
        task.setStatus(SYNC_STATUS_RUNNING);
        task.setAttemptCount(task.getAttemptCount() + 1);
        wikiPageSyncTaskV2Repository.save(task);
        try {
            if (SYNC_OPERATION_DELETE.equalsIgnoreCase(task.getOperation())) {
                hindsightClientService.deleteWikiSpaceDocument(task.getSpace().getId(), task.getDocumentId());
            } else {
                WikiPageV2Entity page = task.getPage();
                if (page == null) {
                    throw new IllegalStateException("同步页面不存在");
                }
                hindsightClientService.retainWikiSpaceDocument(
                        page.getSpace().getId(),
                        task.getDocumentId(),
                        page.getTitle(),
                        buildHindsightContent(page),
                        buildHindsightTags(page),
                        buildHindsightMetadata(page)
                );
                page.setSyncStatus(SYNC_STATUS_SYNCED);
                page.setLastSyncedAt(LocalDateTime.now());
                page.setLastSyncError("");
                wikiPageV2Repository.save(page);
            }
            task.setStatus(SYNC_STATUS_SYNCED);
            task.setLastError("");
        } catch (RuntimeException exception) {
            handleSyncFailure(task, exception);
        }
        wikiPageSyncTaskV2Repository.save(task);
    }

    private void handleSyncFailure(WikiPageSyncTaskV2Entity task, RuntimeException exception) {
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
            wikiPageV2Repository.save(task.getPage());
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

    private UserContext requireCurrentUserContext() {
        AuthContext authContext = AuthContextHolder.get()
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
        UserEntity user = userRepository.findWithDetailsById(authContext.userId())
                .orElseThrow(() -> new UnauthorizedException("当前用户不存在"));
        return new UserContext(user, authContext);
    }

    private WikiSpaceEntity requireSpace(Long spaceId) {
        return wikiSpaceRepository.findById(spaceId)
                .orElseThrow(() -> new NoSuchElementException("Wiki 空间不存在"));
    }

    private WikiDirectoryEntity requireDirectory(Long spaceId, Long directoryId) {
        return wikiDirectoryRepository.findBySpace_IdAndId(spaceId, directoryId)
                .orElseThrow(() -> new NoSuchElementException("Wiki 目录不存在"));
    }

    private WikiPageV2Entity requirePage(Long spaceId, Long pageId) {
        return wikiPageV2Repository.findDetailBySpace_IdAndId(spaceId, pageId)
                .or(() -> wikiPageV2Repository.findBySpace_IdAndId(spaceId, pageId))
                .orElseThrow(() -> new NoSuchElementException("Wiki 页面不存在"));
    }

    private UserEntity requireUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NoSuchElementException("用户不存在"));
    }

    private ProjectEntity requireVisibleProject(Long projectId) {
        ProjectEntity project = projectRepository.findById(projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在"));
        projectDataPermissionService.requireProjectVisible(project);
        return project;
    }

    private void requireSpaceVisible(WikiSpaceEntity space, UserContext userContext) {
        if (!canViewSpace(space, userContext)) {
            throw new ForbiddenException("无权访问当前 Wiki 空间");
        }
    }

    private void requireSpaceEditable(WikiSpaceEntity space, UserContext userContext) {
        if (!canEditSpace(space, userContext)) {
            throw new ForbiddenException("无权维护当前 Wiki 空间内容");
        }
    }

    private void requireSpaceManageable(WikiSpaceEntity space, UserContext userContext) {
        if (!canManageSpace(space, userContext)) {
            throw new ForbiddenException("无权管理当前 Wiki 空间");
        }
    }

    private boolean canViewSpace(WikiSpaceEntity space, UserContext userContext) {
        if (space == null || userContext == null) {
            return false;
        }
        if (userContext.superAdmin()) {
            return true;
        }
        return READ_SCOPE_ALL_LOGGED_IN.equalsIgnoreCase(space.getReadScope())
                || memberRole(space.getId(), userContext.userId()) != null;
    }

    private boolean canEditSpace(WikiSpaceEntity space, UserContext userContext) {
        if (space == null || userContext == null) {
            return false;
        }
        if (userContext.superAdmin()) {
            return true;
        }
        String role = memberRole(space.getId(), userContext.userId());
        return ROLE_ADMIN.equals(role) || ROLE_EDITOR.equals(role);
    }

    private boolean canManageSpace(WikiSpaceEntity space, UserContext userContext) {
        if (space == null || userContext == null) {
            return false;
        }
        if (userContext.superAdmin()) {
            return true;
        }
        return ROLE_ADMIN.equals(memberRole(space.getId(), userContext.userId()));
    }

    private String memberRole(Long spaceId, Long userId) {
        return wikiSpaceMemberRepository.findBySpace_IdAndUser_Id(spaceId, userId)
                .map(WikiSpaceMemberEntity::getMemberRole)
                .map(this::normalizeMemberRole)
                .orElse(null);
    }

    private List<WikiSpaceEntity> resolveVisibleSpaces(Long spaceId, UserContext userContext) {
        if (spaceId != null) {
            WikiSpaceEntity space = requireSpace(spaceId);
            requireSpaceVisible(space, userContext);
            return List.of(space);
        }
        return wikiSpaceRepository.findAll(Sort.by(Sort.Direction.ASC, "name", "id")).stream()
                .filter(space -> canViewSpace(space, userContext))
                .toList();
    }

    private List<WikiPageV2Entity> resolveCandidatePages(Long spaceId) {
        if (spaceId != null) {
            return wikiPageV2Repository.findAllBySpace_IdOrderByUpdatedAtDescIdDesc(spaceId);
        }
        return wikiPageV2Repository.findAll(Sort.by(Sort.Direction.DESC, "updatedAt", "id"));
    }

    private boolean spaceContainsProject(Long spaceId, Long projectId) {
        WikiSpaceEntity space = requireSpace(spaceId);
        if (space.getBoundProject() != null && Objects.equals(space.getBoundProject().getId(), projectId)) {
            return true;
        }
        return wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(spaceId).stream()
                .anyMatch(directory -> Objects.equals(resolveEffectiveBoundProjectId(directory), projectId));
    }

    private List<WikiDirectoryTreeNode> buildDirectoryTree(List<WikiDirectoryEntity> directories, List<WikiPageV2Entity> pages) {
        Map<Long, List<WikiDirectoryEntity>> childrenByParent = new LinkedHashMap<>();
        Map<Long, List<WikiPageV2Entity>> pagesByDirectory = new LinkedHashMap<>();
        for (WikiDirectoryEntity directory : directories) {
            Long parentId = directory.getParentDirectory() == null ? null : directory.getParentDirectory().getId();
            childrenByParent.computeIfAbsent(parentId, ignored -> new ArrayList<>()).add(directory);
        }
        for (WikiPageV2Entity page : pages) {
            pagesByDirectory.computeIfAbsent(page.getDirectory().getId(), ignored -> new ArrayList<>()).add(page);
        }
        UserContext userContext = requireCurrentUserContext();
        return buildDirectoryNodes(null, childrenByParent, pagesByDirectory, userContext);
    }

    private List<WikiDirectoryTreeNode> buildDirectoryNodes(Long parentId,
                                                            Map<Long, List<WikiDirectoryEntity>> childrenByParent,
                                                            Map<Long, List<WikiPageV2Entity>> pagesByDirectory,
                                                            UserContext userContext) {
        return childrenByParent.getOrDefault(parentId, List.of()).stream()
                .sorted(Comparator.comparingInt(WikiDirectoryEntity::getSortOrder).thenComparing(WikiDirectoryEntity::getId))
                .map(directory -> new WikiDirectoryTreeNode(
                        directory.getId(),
                        parentId,
                        directory.getName(),
                        directory.getSlug(),
                        directory.getContent(),
                        resolveEffectiveBoundProjectId(directory),
                        resolveEffectiveBoundProjectName(directory),
                        buildDirectoryNodes(directory.getId(), childrenByParent, pagesByDirectory, userContext),
                        buildPageTree(pagesByDirectory.getOrDefault(directory.getId(), List.of()), userContext)
                ))
                .toList();
    }

    private WikiSpaceSummary toSpaceSummary(WikiSpaceEntity space, UserContext userContext) {
        List<WikiDirectoryEntity> directories = wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(space.getId());
        int pageCount = directories.stream()
                .mapToInt(directory -> wikiPageV2Repository.findAllByDirectory_IdOrderByUpdatedAtDescIdDesc(directory.getId()).size())
                .sum();
        long boundProjectCount = directories.stream()
                .map(this::resolveEffectiveBoundProjectId)
                .filter(Objects::nonNull)
                .distinct()
                .count();
        return new WikiSpaceSummary(
                space.getId(),
                space.getName(),
                space.getDescription(),
                space.getReadScope(),
                space.getBoundProject() == null ? null : space.getBoundProject().getId(),
                space.getBoundProject() == null ? "" : defaultString(space.getBoundProject().getName()),
                normalizeMemberDefaultSource(space.getMemberDefaultSource(), space.getBoundProject()),
                defaultString(memberRole(space.getId(), userContext.userId())),
                directories.size(),
                pageCount,
                Math.toIntExact(boundProjectCount),
                canManageSpace(space, userContext),
                formatTime(space.getCreatedAt()),
                formatTime(space.getUpdatedAt())
        );
    }

    private WikiSpaceDetail toSpaceDetail(WikiSpaceEntity space, UserContext userContext) {
        List<WikiDirectoryEntity> directories = wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(space.getId());
        int pageCount = directories.stream()
                .mapToInt(directory -> wikiPageV2Repository.findAllByDirectory_IdOrderByUpdatedAtDescIdDesc(directory.getId()).size())
                .sum();
        long boundProjectCount = directories.stream()
                .map(this::resolveEffectiveBoundProjectId)
                .filter(Objects::nonNull)
                .distinct()
                .count();
        return new WikiSpaceDetail(
                space.getId(),
                space.getName(),
                space.getDescription(),
                space.getReadScope(),
                space.getBoundProject() == null ? null : space.getBoundProject().getId(),
                space.getBoundProject() == null ? "" : defaultString(space.getBoundProject().getName()),
                normalizeMemberDefaultSource(space.getMemberDefaultSource(), space.getBoundProject()),
                defaultString(memberRole(space.getId(), userContext.userId())),
                displayName(space.getCreatorUser()),
                directories.size(),
                pageCount,
                Math.toIntExact(boundProjectCount),
                canManageSpace(space, userContext),
                formatTime(space.getCreatedAt()),
                formatTime(space.getUpdatedAt())
        );
    }

    private WikiSpaceMemberSummary toMemberSummary(WikiSpaceMemberEntity member) {
        UserEntity user = member.getUser();
        return new WikiSpaceMemberSummary(
                user.getId(),
                defaultString(user.getUsername()),
                defaultString(user.getNickname()),
                defaultString(user.getAvatarUrl()),
                defaultString(member.getMemberRole())
        );
    }

    private WikiDirectorySummary toDirectorySummary(WikiDirectoryEntity directory) {
        return new WikiDirectorySummary(
                directory.getId(),
                directory.getSpace().getId(),
                directory.getParentDirectory() == null ? null : directory.getParentDirectory().getId(),
                directory.getName(),
                directory.getSlug(),
                directory.getContent(),
                directory.getSortOrder(),
                resolveEffectiveBoundProjectId(directory),
                resolveEffectiveBoundProjectName(directory),
                displayName(directory.getCreatedByUser()),
                formatTime(directory.getCreatedAt()),
                formatTime(directory.getUpdatedAt())
        );
    }

    private WikiSpacePageSummary toPageSummary(WikiPageV2Entity page, UserContext userContext) {
        return toPageSummary(page, userContext, List.of());
    }

    private WikiSpacePageSummary toPageSummary(WikiPageV2Entity page,
                                               UserContext userContext,
                                               List<WikiSpacePageSummary> children) {
        return new WikiSpacePageSummary(
                page.getId(),
                page.getSpace().getId(),
                page.getSpace().getName(),
                page.getDirectory().getId(),
                page.getDirectory().getName(),
                page.getParentPage() == null ? null : page.getParentPage().getId(),
                resolveEffectiveBoundProjectId(page.getDirectory()),
                resolveEffectiveBoundProjectName(page.getDirectory()),
                page.getTitle(),
                page.getSlug(),
                page.getCurrentVersionNumber(),
                page.getSyncStatus(),
                displayName(page.getAuthorUser()),
                canEditSpace(page.getSpace(), userContext),
                formatTime(page.getUpdatedAt()),
                children
        );
    }

    private WikiSpacePageDetail toPageDetail(WikiPageV2Entity page, UserContext userContext, List<WikiSpacePageSummary> relatedPages) {
        return new WikiSpacePageDetail(
                page.getId(),
                page.getSpace().getId(),
                page.getSpace().getName(),
                page.getDirectory().getId(),
                page.getDirectory().getName(),
                page.getParentPage() == null ? null : page.getParentPage().getId(),
                resolveEffectiveBoundProjectId(page.getDirectory()),
                resolveEffectiveBoundProjectName(page.getDirectory()),
                page.getTitle(),
                page.getSlug(),
                page.getContent(),
                page.getCurrentVersionNumber(),
                page.getSyncStatus(),
                formatTime(page.getLastSyncedAt()),
                defaultString(page.getLastSyncError()),
                displayName(page.getAuthorUser()),
                canEditSpace(page.getSpace(), userContext),
                buildImportSource(page),
                relatedPages,
                formatTime(page.getCreatedAt()),
                formatTime(page.getUpdatedAt())
        );
    }

    private WikiImportSourceSummary buildImportSource(WikiPageV2Entity page) {
        if (page == null || page.getSourceDocumentAsset() == null) {
            return null;
        }
        DocumentAssetEntity asset = page.getSourceDocumentAsset();
        return new WikiImportSourceSummary(
                asset.getId(),
                defaultString(asset.getFileName()),
                defaultString(asset.getContentType()),
                asset.getFileSize(),
                defaultString(asset.getSourceFormat()),
                false,
                List.of()
        );
    }

    /**
     * Wiki 导入图片按空间和资产隔离目录，便于后续按前缀清理临时图片。
     */
    private String buildImportImageDirectory(Long spaceId, Long assetId) {
        return "wiki-spaces/space-" + spaceId + "/imports/asset-" + assetId;
    }

    private WikiSpacePageVersionSummary toPageVersionSummary(WikiPageVersionV2Entity version) {
        return new WikiSpacePageVersionSummary(
                version.getId(),
                version.getPage().getId(),
                version.getVersionNumber(),
                version.getTitle(),
                version.getContent(),
                displayName(version.getAuthorUser()),
                version.getChangeSummary(),
                formatTime(version.getCreatedAt())
        );
    }

    private void ensureNoDirectoryCycle(WikiDirectoryEntity directory, WikiDirectoryEntity parentDirectory) {
        WikiDirectoryEntity cursor = parentDirectory;
        while (cursor != null) {
            if (Objects.equals(cursor.getId(), directory.getId())) {
                throw new IllegalArgumentException("父目录不能选择自己或自己的子目录");
            }
            cursor = cursor.getParentDirectory();
        }
    }

    private void ensureNoPageCycle(WikiPageV2Entity page, WikiPageV2Entity parentPage) {
        WikiPageV2Entity cursor = parentPage;
        while (cursor != null) {
            if (Objects.equals(cursor.getId(), page.getId())) {
                throw new IllegalArgumentException("父页面不能选择自己或自己的子页面");
            }
            cursor = cursor.getParentPage();
        }
    }

    private void collectDirectorySubtree(WikiDirectoryEntity root,
                                         List<WikiDirectoryEntity> allDirectories,
                                         List<WikiPageV2Entity> allPages,
                                         Map<Long, WikiDirectoryEntity> directories,
                                         Map<Long, WikiPageV2Entity> pages) {
        directories.putIfAbsent(root.getId(), root);
        for (WikiPageV2Entity page : allPages) {
            if (Objects.equals(page.getDirectory().getId(), root.getId())) {
                pages.putIfAbsent(page.getId(), page);
            }
        }
        for (WikiDirectoryEntity child : allDirectories) {
            if (child.getParentDirectory() != null && Objects.equals(child.getParentDirectory().getId(), root.getId())) {
                collectDirectorySubtree(child, allDirectories, allPages, directories, pages);
            }
        }
    }

    private void createPageVersion(WikiPageV2Entity page, int versionNumber, UserEntity author, String changeSummary) {
        WikiPageVersionV2Entity version = new WikiPageVersionV2Entity();
        version.setPage(page);
        version.setVersionNumber(versionNumber);
        version.setTitle(page.getTitle());
        version.setContent(page.getContent());
        version.setChangeSummary(abbreviate(defaultString(changeSummary).isBlank() ? "更新页面" : changeSummary, 500));
        version.setAuthorUser(author);
        wikiPageVersionV2Repository.save(version);
    }

    private void enqueueRetainTask(WikiPageV2Entity page) {
        WikiPageSyncTaskV2Entity task = new WikiPageSyncTaskV2Entity();
        task.setSpace(page.getSpace());
        task.setPage(page);
        task.setOperation(SYNC_OPERATION_RETAIN);
        task.setDocumentId(documentId(page.getId()));
        task.setStatus(SYNC_STATUS_PENDING);
        wikiPageSyncTaskV2Repository.save(task);
    }

    private void enqueueDeleteTask(WikiPageV2Entity page) {
        WikiPageSyncTaskV2Entity task = new WikiPageSyncTaskV2Entity();
        task.setSpace(page.getSpace());
        task.setOperation(SYNC_OPERATION_DELETE);
        task.setDocumentId(documentId(page.getId()));
        task.setStatus(SYNC_STATUS_PENDING);
        wikiPageSyncTaskV2Repository.save(task);
    }

    private String buildHindsightContent(WikiPageV2Entity page) {
        return "空间：" + page.getSpace().getName() + "\n"
                + "目录：" + buildDirectoryPath(page.getDirectory()) + "\n"
                + "标题：" + page.getTitle() + "\n"
                + "Slug：" + page.getSlug() + "\n"
                + "关联项目：" + defaultString(resolveEffectiveBoundProjectName(page.getDirectory())) + "\n\n"
                + page.getContent();
    }

    private List<String> buildHindsightTags(WikiPageV2Entity page) {
        List<String> tags = new ArrayList<>();
        tags.add("wiki");
        tags.add("source:wiki");
        tags.add("space:" + page.getSpace().getId());
        tags.add("directory:" + page.getDirectory().getId());
        Long boundProjectId = resolveEffectiveBoundProjectId(page.getDirectory());
        if (boundProjectId != null) {
            tags.add("project:" + boundProjectId);
        }
        return tags;
    }

    private Map<String, Object> buildHindsightMetadata(WikiPageV2Entity page) {
        LinkedHashMap<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("spaceId", page.getSpace().getId());
        metadata.put("pageId", page.getId());
        metadata.put("directoryId", page.getDirectory().getId());
        if (page.getParentPage() != null) {
            metadata.put("parentPageId", page.getParentPage().getId());
        }
        metadata.put("slug", page.getSlug());
        metadata.put("title", page.getTitle());
        Long boundProjectId = resolveEffectiveBoundProjectId(page.getDirectory());
        if (boundProjectId != null) {
            metadata.put("projectId", boundProjectId);
        }
        return Map.copyOf(metadata);
    }

    private String buildDirectoryPath(WikiDirectoryEntity directory) {
        List<String> names = new ArrayList<>();
        WikiDirectoryEntity cursor = directory;
        while (cursor != null) {
            names.add(0, cursor.getName());
            cursor = cursor.getParentDirectory();
        }
        return String.join(" / ", names);
    }

    private Long resolveEffectiveBoundProjectId(WikiDirectoryEntity directory) {
        WikiDirectoryEntity cursor = directory;
        while (cursor != null) {
            if (cursor.getBoundProject() != null) {
                return cursor.getBoundProject().getId();
            }
            cursor = cursor.getParentDirectory();
        }
        return directory != null && directory.getSpace() != null && directory.getSpace().getBoundProject() != null
                ? directory.getSpace().getBoundProject().getId()
                : null;
    }

    private String resolveEffectiveBoundProjectName(WikiDirectoryEntity directory) {
        WikiDirectoryEntity cursor = directory;
        while (cursor != null) {
            if (cursor.getBoundProject() != null) {
                return cursor.getBoundProject().getName();
            }
            cursor = cursor.getParentDirectory();
        }
        return directory != null && directory.getSpace() != null && directory.getSpace().getBoundProject() != null
                ? defaultString(directory.getSpace().getBoundProject().getName())
                : "";
    }

    private List<WikiSpacePageSummary> safeRelatedPages(WikiPageV2Entity page, int limit) {
        try {
            return relatedPages(page.getSpace().getId(), page.getId(), limit);
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private String generateUniqueDirectorySlug(Long spaceId, Long parentDirectoryId, String name, Long currentDirectoryId) {
        String baseSlug = toSlug(name, "directory");
        String candidate = baseSlug;
        int index = 2;
        while (currentDirectoryId == null
                ? wikiDirectoryRepository.existsSiblingSlug(spaceId, parentDirectoryId, candidate)
                : wikiDirectoryRepository.existsSiblingSlugExcludingSelf(spaceId, parentDirectoryId, candidate, currentDirectoryId)) {
            candidate = baseSlug + "-" + index;
            index++;
        }
        return candidate;
    }

    private WikiDirectoryEntity ensureDefaultDirectory(WikiSpaceEntity space, UserEntity creatorUser) {
        List<WikiDirectoryEntity> existingDirectories = wikiDirectoryRepository.findAllBySpace_IdOrderBySortOrderAscIdAsc(space.getId());
        if (!existingDirectories.isEmpty()) {
            return existingDirectories.get(0);
        }
        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setSpace(space);
        directory.setName("默认目录");
        directory.setSlug(generateUniqueDirectorySlug(space.getId(), null, "默认目录", null));
        directory.setContent("");
        directory.setSortOrder(1);
        directory.setCreatedByUser(creatorUser);
        return wikiDirectoryRepository.save(directory);
    }

    private WikiPageV2Entity resolveParentPage(Long spaceId, WikiDirectoryEntity directory, Long parentPageId) {
        if (parentPageId == null) {
            return null;
        }
        WikiPageV2Entity parentPage = requirePage(spaceId, parentPageId);
        if (!Objects.equals(parentPage.getDirectory().getId(), directory.getId())) {
            throw new IllegalArgumentException("父页面必须与当前页面处于同一目录");
        }
        return parentPage;
    }

    private List<WikiSpacePageSummary> buildPageTree(List<WikiPageV2Entity> pages, UserContext userContext) {
        if (pages.isEmpty()) {
            return List.of();
        }
        Map<Long, List<WikiPageV2Entity>> childrenByParentPage = new LinkedHashMap<>();
        Set<Long> pageIds = new LinkedHashSet<>();
        for (WikiPageV2Entity page : pages) {
            pageIds.add(page.getId());
        }
        for (WikiPageV2Entity page : pages) {
            Long parentPageId = page.getParentPage() == null ? null : page.getParentPage().getId();
            if (parentPageId != null && !pageIds.contains(parentPageId)) {
                parentPageId = null;
            }
            childrenByParentPage.computeIfAbsent(parentPageId, ignored -> new ArrayList<>()).add(page);
        }
        return buildPageNodes(null, childrenByParentPage, userContext);
    }

    private List<WikiSpacePageSummary> buildPageNodes(Long parentPageId,
                                                      Map<Long, List<WikiPageV2Entity>> childrenByParentPage,
                                                      UserContext userContext) {
        return childrenByParentPage.getOrDefault(parentPageId, List.of()).stream()
                .sorted(Comparator.comparing(WikiPageV2Entity::getUpdatedAt).reversed()
                        .thenComparing(WikiPageV2Entity::getId, Comparator.reverseOrder()))
                .map(page -> toPageSummary(page, userContext, buildPageNodes(page.getId(), childrenByParentPage, userContext)))
                .toList();
    }

    private String generateUniquePageSlug(Long spaceId, String title, Long currentPageId) {
        String baseSlug = toSlug(title, "page");
        String candidate = baseSlug;
        int index = 2;
        while (currentPageId == null
                ? wikiPageV2Repository.existsBySpace_IdAndSlugIgnoreCase(spaceId, candidate)
                : wikiPageV2Repository.existsBySpace_IdAndSlugIgnoreCaseAndIdNot(spaceId, candidate, currentPageId)) {
            candidate = baseSlug + "-" + index;
            index++;
        }
        return candidate;
    }

    private String toSlug(String value, String fallback) {
        String normalized = Normalizer.normalize(defaultString(value), Normalizer.Form.NFKC)
                .trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", "-");
        normalized = SLUG_UNSAFE_PATTERN.matcher(normalized).replaceAll("-");
        normalized = normalized.replaceAll("-+", "-").replaceAll("^-|-$", "");
        if (normalized.isBlank()) {
            normalized = fallback;
        }
        return normalized.length() > 180 ? normalized.substring(0, 180).replaceAll("-$", "") : normalized;
    }

    private String normalizeReadScope(String readScope) {
        String value = defaultString(readScope).toUpperCase(Locale.ROOT);
        if (value.isBlank()) {
            return READ_SCOPE_MEMBERS_ONLY;
        }
        return switch (value) {
            case READ_SCOPE_MEMBERS_ONLY, READ_SCOPE_ALL_LOGGED_IN -> value;
            default -> throw new IllegalArgumentException("不支持的空间读取范围: " + readScope);
        };
    }

    private String normalizeMemberRole(String memberRole) {
        String value = defaultString(memberRole).toUpperCase(Locale.ROOT);
        if (value.isBlank()) {
            return ROLE_VIEWER;
        }
        return switch (value) {
            case ROLE_ADMIN, ROLE_EDITOR, ROLE_VIEWER -> value;
            default -> throw new IllegalArgumentException("不支持的空间成员角色: " + memberRole);
        };
    }

    /**
     * 规范化空间成员默认来源。
     */
    private String normalizeMemberDefaultSource(String memberDefaultSource, ProjectEntity boundProject) {
        String value = defaultString(memberDefaultSource).toUpperCase(Locale.ROOT);
        if (value.isBlank()) {
            value = MEMBER_SOURCE_MANUAL;
        }
        return switch (value) {
            case MEMBER_SOURCE_MANUAL -> MEMBER_SOURCE_MANUAL;
            case MEMBER_SOURCE_PROJECT_MEMBERS -> {
                if (boundProject == null) {
                    throw new IllegalArgumentException("选择项目成员默认配置前，请先绑定项目");
                }
                yield MEMBER_SOURCE_PROJECT_MEMBERS;
            }
            default -> throw new IllegalArgumentException("不支持的空间成员默认来源: " + memberDefaultSource);
        };
    }

    /**
     * 按空间成员默认来源初始化或重置空间成员。
     */
    @Transactional
    private void applyDefaultMembers(WikiSpaceEntity space,
                                     UserEntity operator,
                                     ProjectEntity boundProject,
                                     String memberDefaultSource,
                                     boolean initializeCreatorOnly) {
        if (space == null || operator == null) {
            return;
        }
        wikiSpaceMemberRepository.deleteAllBySpace_Id(space.getId());
        if (MEMBER_SOURCE_PROJECT_MEMBERS.equals(memberDefaultSource) && boundProject != null) {
            saveProjectDefaultMembers(space, boundProject, operator);
            return;
        }
        if (initializeCreatorOnly) {
            saveSpaceMember(space, operator, ROLE_ADMIN);
            return;
        }
        saveSpaceMember(space, operator, ROLE_ADMIN);
    }

    /**
     * 将项目负责人、创建人和成员带入空间成员，并保留当前操作者管理员权限。
     */
    private void saveProjectDefaultMembers(WikiSpaceEntity space, ProjectEntity project, UserEntity operator) {
        LinkedHashMap<Long, UserEntity> userById = new LinkedHashMap<>();
        LinkedHashMap<Long, String> roleByUserId = new LinkedHashMap<>();
        addProjectDefaultMember(userById, roleByUserId, project.getOwnerUser(), ROLE_EDITOR);
        addProjectDefaultMember(userById, roleByUserId, project.getCreatorUser(), ROLE_EDITOR);
        for (UserEntity member : project.getMembers()) {
            addProjectDefaultMember(userById, roleByUserId, member, ROLE_VIEWER);
        }
        addProjectDefaultMember(userById, roleByUserId, operator, ROLE_ADMIN);
        for (Map.Entry<Long, UserEntity> entry : userById.entrySet()) {
            saveSpaceMember(space, entry.getValue(), roleByUserId.get(entry.getKey()));
        }
    }

    /**
     * 记录项目默认成员，并按 ADMIN > EDITOR > VIEWER 的优先级合并角色。
     */
    private void addProjectDefaultMember(Map<Long, UserEntity> userById,
                                         Map<Long, String> roleByUserId,
                                         UserEntity user,
                                         String memberRole) {
        if (user == null || user.getId() == null) {
            return;
        }
        userById.putIfAbsent(user.getId(), user);
        roleByUserId.merge(user.getId(), normalizeMemberRole(memberRole), this::mergeMemberRole);
    }

    /**
     * 保存单个空间成员，复用统一的成员角色规范。
     */
    private void saveSpaceMember(WikiSpaceEntity space, UserEntity user, String memberRole) {
        WikiSpaceMemberEntity member = new WikiSpaceMemberEntity();
        member.setSpace(space);
        member.setUser(user);
        member.setMemberRole(normalizeMemberRole(memberRole));
        wikiSpaceMemberRepository.save(member);
    }

    /**
     * 合并默认成员角色，优先保留权限更高的角色。
     */
    private String mergeMemberRole(String left, String right) {
        return memberRolePriority(left) >= memberRolePriority(right) ? left : right;
    }

    /**
     * 角色优先级用于解决同一用户在项目负责人、创建人和普通成员中的角色冲突。
     */
    private int memberRolePriority(String role) {
        return switch (normalizeMemberRole(role)) {
            case ROLE_ADMIN -> 3;
            case ROLE_EDITOR -> 2;
            case ROLE_VIEWER -> 1;
            default -> 0;
        };
    }

    private Long parsePageIdFromDocumentId(String documentId) {
        if (!StringUtils.hasText(documentId) || !documentId.startsWith("wiki-page-v2:")) {
            return null;
        }
        try {
            return Long.parseLong(documentId.substring("wiki-page-v2:".length()));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private String documentId(Long pageId) {
        return "wiki-page-v2:" + pageId;
    }

    private boolean containsIgnoreCase(String value, String keyword) {
        return defaultString(value).toLowerCase(Locale.ROOT).contains(defaultString(keyword).toLowerCase(Locale.ROOT));
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return "";
        }
        return StringUtils.hasText(user.getNickname()) ? user.getNickname().trim() : defaultString(user.getUsername());
    }

    private String formatTime(LocalDateTime time) {
        return time == null ? "" : TIME_FORMATTER.format(time);
    }

    private String firstText(String preferred, String fallback) {
        return StringUtils.hasText(preferred) ? preferred : defaultString(fallback);
    }

    private String abbreviate(String value, int maxLength) {
        String normalized = defaultString(value);
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * 当前登录用户与权限上下文快照。
     */
    private record UserContext(UserEntity user, AuthContext authContext) {
        private Long userId() {
            return user.getId();
        }

        private boolean superAdmin() {
            return authContext.roleCodes() != null && authContext.roleCodes().contains("SUPER_ADMIN");
        }
    }

    /**
     * 项目图谱使用的 Wiki 投影。
     */
    public record WikiProjectGraphProjection(
            List<WikiSpaceEntity> spaces,
            List<WikiDirectoryEntity> directories,
            List<WikiPageV2Entity> pages
    ) {
    }
}
