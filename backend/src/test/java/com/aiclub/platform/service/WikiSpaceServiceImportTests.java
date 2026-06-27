package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiPageVersionV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.WikiSpacePageDetail;
import com.aiclub.platform.dto.request.CreateWikiImportPageRequest;
import com.aiclub.platform.exception.ForbiddenException;
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
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Wiki 导入页面时会优先使用前端提交的最终 Markdown，避免重复转换图片。
 */
@ExtendWith(MockitoExtension.class)
class WikiSpaceServiceImportTests {

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
                documentMarkdownService
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

    @Test
    void shouldUseSubmittedMarkdownContentWithoutReConvertingDocument() {
        TestFixture fixture = prepareFixture();
        ArgumentCaptor<WikiPageV2Entity> pageCaptor = ArgumentCaptor.forClass(WikiPageV2Entity.class);

        WikiSpacePageDetail detail = wikiSpaceService.importPage(10L, new CreateWikiImportPageRequest(
                30L,
                20L,
                null,
                "导入页面",
                "# 已编辑正文\n\n![图片](http://localhost:8080/comment-images?key=demo)"
        ));

        verify(documentMarkdownService, never()).convert(anyLong(), anyString(), anyInt());
        verify(documentMarkdownService, never()).convert(anyLong(), anyString(), anyInt(), anyString());
        verify(wikiPageV2Repository).save(pageCaptor.capture());
        assertThat(pageCaptor.getValue().getContent()).isEqualTo("# 已编辑正文\n\n![图片](http://localhost:8080/comment-images?key=demo)");
        assertThat(detail.content()).isEqualTo("# 已编辑正文\n\n![图片](http://localhost:8080/comment-images?key=demo)");
        assertThat(detail.importSource()).isNotNull();
        assertThat(detail.importSource().warnings()).isEqualTo(List.of());
        verify(documentAssetService).bindAsset(fixture.asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, null);
        verify(documentAssetService).bindAsset(fixture.asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, 55L);
    }

    @Test
    void shouldFallbackToDocumentConversionWhenSubmittedContentIsBlank() {
        prepareFixture();
        when(documentMarkdownService.convert(
                30L,
                DocumentMarkdownService.SCENE_WIKI_IMPORT,
                200000,
                "wiki-spaces/space-10/imports/asset-30"
        )).thenReturn(new DocumentMarkdownResult(
                30L,
                "source.pdf",
                "导入页面",
                "PDF",
                "# 转换后的正文",
                false,
                List.of("图片已保留")
        ));

        WikiSpacePageDetail detail = wikiSpaceService.importPage(10L, new CreateWikiImportPageRequest(
                30L,
                20L,
                null,
                "导入页面",
                "   "
        ));

        verify(documentMarkdownService).convert(
                30L,
                DocumentMarkdownService.SCENE_WIKI_IMPORT,
                200000,
                "wiki-spaces/space-10/imports/asset-30"
        );
        assertThat(detail.content()).isEqualTo("# 转换后的正文");
    }

    @Test
    void shouldRequireProjectVisibilityForProjectBoundPublicSpace() {
        AuthContextHolder.set(new AuthContext(
                2L,
                "member",
                "普通用户",
                Set.of(),
                Set.of("wiki:view")
        ));
        UserEntity user = new UserEntity();
        user.setId(2L);
        user.setUsername("member");
        user.setNickname("普通用户");
        ProjectEntity project = new ProjectEntity();
        project.setId(99L);
        project.setName("受限项目");
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(10L);
        space.setName("项目 Wiki");
        space.setReadScope(WikiSpaceService.READ_SCOPE_ALL_LOGGED_IN);
        space.setBoundProject(project);

        when(userRepository.findWithDetailsById(2L)).thenReturn(Optional.of(user));
        when(wikiSpaceRepository.findById(10L)).thenReturn(Optional.of(space));
        doThrow(new ForbiddenException("无权访问项目数据"))
                .when(projectDataPermissionService).requireProjectVisible(project);

        assertThatThrownBy(() -> wikiSpaceService.getSpaceDetail(10L))
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("无权访问项目数据");
    }

    private TestFixture prepareFixture() {
        UserEntity user = new UserEntity();
        user.setId(1L);
        user.setUsername("admin");
        user.setNickname("管理员");

        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(10L);
        space.setName("知识空间");
        space.setReadScope(WikiSpaceService.READ_SCOPE_MEMBERS_ONLY);

        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("产品目录");
        directory.setSpace(space);

        DocumentAssetEntity asset = new DocumentAssetEntity();
        asset.setId(30L);
        asset.setFileName("source.pdf");
        asset.setContentType("application/pdf");
        asset.setFileSize(1024);
        asset.setSourceFormat("PDF");

        when(userRepository.findWithDetailsById(1L)).thenReturn(Optional.of(user));
        when(wikiSpaceRepository.findById(10L)).thenReturn(Optional.of(space));
        when(wikiDirectoryRepository.findBySpace_IdAndId(10L, 20L)).thenReturn(Optional.of(directory));
        when(wikiPageV2Repository.existsBySpace_IdAndSlugIgnoreCase(eq(10L), any())).thenReturn(false);
        when(documentAssetService.requireAccessibleAsset(30L)).thenReturn(asset);
        when(documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, null)).thenReturn(asset);
        when(documentAssetService.bindAsset(asset, DocumentAssetService.BIZ_TYPE_WIKI_PAGE, 55L)).thenReturn(asset);
        when(wikiPageVersionV2Repository.save(any(WikiPageVersionV2Entity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageSyncTaskV2Repository.save(any(WikiPageSyncTaskV2Entity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageV2Repository.save(any(WikiPageV2Entity.class))).thenAnswer(invocation -> {
            WikiPageV2Entity entity = invocation.getArgument(0);
            entity.setId(55L);
            entity.setCreatedAt(LocalDateTime.of(2026, 4, 18, 18, 0, 0));
            entity.setUpdatedAt(LocalDateTime.of(2026, 4, 18, 18, 0, 0));
            return entity;
        });
        return new TestFixture(asset);
    }

    private record TestFixture(DocumentAssetEntity asset) {
    }
}
