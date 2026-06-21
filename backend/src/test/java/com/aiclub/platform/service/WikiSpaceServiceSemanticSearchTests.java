package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiSpaceMemberEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.WikiSpaceSearchResult;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 覆盖空间 Wiki 知识检索在 score 为空时的顺序保持，
 * 避免数据库批量查询顺序覆盖知识检索服务已经排好的结果顺序。
 */
@ExtendWith(MockitoExtension.class)
class WikiSpaceServiceSemanticSearchTests {

    @Mock
    private WikiSpaceRepository wikiSpaceRepository;

    @Mock
    private WikiSpaceMemberRepository wikiSpaceMemberRepository;

    @Mock
    private WikiDirectoryRepository wikiDirectoryRepository;

    @Mock
    private WikiPageV2Repository wikiPageV2Repository;

    @Mock
    private WikiPageVersionV2Repository wikiPageVersionV2Repository;

    @Mock
    private WikiPageSyncTaskV2Repository wikiPageSyncTaskV2Repository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private DocumentAssetService documentAssetService;

    @Mock
    private DocumentMarkdownService documentMarkdownService;

    @Mock
    private WikiKnowledgeSearchService wikiKnowledgeSearchService;

    private WikiSpaceService wikiSpaceService;

    @BeforeEach
    void setUp() {
        wikiSpaceService = new WikiSpaceService(
                wikiSpaceRepository,
                wikiSpaceMemberRepository,
                wikiDirectoryRepository,
                wikiPageV2Repository,
                wikiPageVersionV2Repository,
                wikiPageSyncTaskV2Repository,
                userRepository,
                projectRepository,
                projectDataPermissionService,
                hindsightClientService,
                documentAssetService,
                documentMarkdownService,
                wikiKnowledgeSearchService
        );
        AuthContextHolder.set(new AuthContext(
                1L,
                "admin",
                "管理员",
                Set.of("SUPER_ADMIN"),
                Set.of("wiki:view")
        ));
    }

    @AfterEach
    void tearDown() {
        AuthContextHolder.clear();
    }

    /**
     * 知识检索命中结果没有数值 score 时，仍应按检索服务返回的原始顺序输出。
     */
    @Test
    void shouldKeepRecallOrderWhenScoresAreNull() {
        UserEntity user = new UserEntity();
        user.setId(1L);
        user.setUsername("admin");
        user.setNickname("管理员");

        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(10L);
        space.setName("测试空间");
        space.setReadScope(WikiSpaceService.READ_SCOPE_MEMBERS_ONLY);

        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("未分类");
        directory.setSpace(space);

        WikiPageV2Entity firstPage = buildPage(101L, "#A-第一页", "2026-04-24T09:00:00", space, directory);
        WikiPageV2Entity secondPage = buildPage(102L, "#B-第二页", "2026-04-24T10:00:00", space, directory);

        when(userRepository.findWithDetailsById(1L)).thenReturn(Optional.of(user));
        when(wikiSpaceRepository.findById(10L)).thenReturn(Optional.of(space));
        when(wikiPageV2Repository.findAllBySpace_IdOrderByUpdatedAtDescIdDesc(10L)).thenReturn(List.of(firstPage, secondPage));
        when(wikiKnowledgeSearchService.hybridSearchSpacePages(eq(10L), eq(null), eq("证书提醒"), anyList(), eq(8))).thenReturn(List.of(
                new WikiKnowledgeSearchService.WikiRankedPageHit(102L, "第二页摘要", null),
                new WikiKnowledgeSearchService.WikiRankedPageHit(101L, "第一页摘要", null)
        ));
        when(wikiPageV2Repository.findAllByIdIn(List.of(102L, 101L))).thenReturn(List.of(secondPage, firstPage));

        List<WikiSpaceSearchResult> results = wikiSpaceService.semanticSearchPages("证书提醒", 10L, null);

        assertThat(results).hasSize(2);
        assertThat(results).extracting(item -> item.page().id()).containsExactly(102L, 101L);
    }

    private WikiPageV2Entity buildPage(Long id,
                                       String title,
                                       String updatedAtIso,
                                       WikiSpaceEntity space,
                                       WikiDirectoryEntity directory) {
        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(id);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle(title);
        page.setSlug("page-" + id);
        page.setContent(title + " 正文，包含证书提醒");
        page.setCurrentVersionNumber(1);
        page.setSyncStatus("SYNCED");
        page.setUpdatedAt(LocalDateTime.parse(updatedAtIso));
        return page;
    }
}
