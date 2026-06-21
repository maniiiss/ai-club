package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.repository.WikiDirectoryRepository;
import com.aiclub.platform.repository.WikiPageSyncTaskV2Repository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.repository.WikiPageVersionV2Repository;
import com.aiclub.platform.repository.WikiSpaceMemberRepository;
import com.aiclub.platform.repository.WikiSpaceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证空间化 Wiki 同步任务会切到独立知识索引链路，
 * 避免继续把页面内容 retain 到 Hindsight 记忆库。
 */
@ExtendWith(MockitoExtension.class)
class WikiSpaceServiceMemoryTagTests {

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

    @Test
    void shouldIndexWikiSpacePageIntoKnowledgeStore() {
        WikiSpaceService wikiSpaceService = new WikiSpaceService(
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
        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("测试项目");
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(9L);
        space.setName("测试空间");
        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("产品目录");
        directory.setSpace(space);
        directory.setBoundProject(project);
        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(201L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("空间发布说明");
        page.setSlug("space-release-note");
        page.setContent("空间正文");

        WikiPageSyncTaskV2Entity task = new WikiPageSyncTaskV2Entity();
        task.setId(1L);
        task.setSpace(space);
        task.setPage(page);
        task.setOperation("RETAIN");
        task.setDocumentId("wiki-page-v2:201");
        task.setStatus("PENDING");
        task.setNextAttemptAt(LocalDateTime.now().minusMinutes(1));

        when(wikiPageSyncTaskV2Repository.findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                org.mockito.ArgumentMatchers.eq("PENDING"),
                any(LocalDateTime.class),
                any(PageRequest.class)
        )).thenReturn(List.of(task));
        when(wikiPageSyncTaskV2Repository.save(any(WikiPageSyncTaskV2Entity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageV2Repository.save(any(WikiPageV2Entity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        wikiSpaceService.processPendingSyncTasks();

        verify(wikiKnowledgeSearchService).indexSpacePage(page);
        verify(hindsightClientService, org.mockito.Mockito.never()).retainWikiSpaceDocument(any(), any(), any(), any(), any(), any());
    }
}
