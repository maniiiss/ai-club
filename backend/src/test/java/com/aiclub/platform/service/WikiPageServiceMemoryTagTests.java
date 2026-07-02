package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiPageEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskEntity;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.repository.WikiPageAccessRepository;
import com.aiclub.platform.repository.WikiPageRepository;
import com.aiclub.platform.repository.WikiPageSyncTaskRepository;
import com.aiclub.platform.repository.WikiPageVersionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证项目 Wiki 同步任务会切到独立知识索引链路，
 * 避免继续把页面内容 retain 到 Hindsight 记忆库。
 */
@ExtendWith(MockitoExtension.class)
class WikiPageServiceMemoryTagTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private WikiPageRepository wikiPageRepository;

    @Mock
    private WikiPageVersionRepository wikiPageVersionRepository;

    @Mock
    private WikiPageAccessRepository wikiPageAccessRepository;

    @Mock
    private WikiPageSyncTaskRepository wikiPageSyncTaskRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private HindsightClientService hindsightClientService;

    @Mock
    private WikiKnowledgeSearchService wikiKnowledgeSearchService;

    @Mock
    private WikiSyncQueuePublisher wikiSyncQueuePublisher;

    @Test
    void shouldIndexProjectPageIntoKnowledgeStore() {
        WikiPageService wikiPageService = new WikiPageService(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService,
                wikiKnowledgeSearchService
        );
        ProjectEntity project = new ProjectEntity();
        project.setId(12L);
        project.setName("测试项目");
        UserEntity author = new UserEntity();
        author.setId(1L);
        author.setUsername("tester");
        WikiPageEntity page = new WikiPageEntity();
        page.setId(101L);
        page.setProject(project);
        page.setTitle("发布说明");
        page.setSlug("release-note");
        page.setContent("这是正文");
        page.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        page.setAuthorUser(author);

        WikiPageSyncTaskEntity task = new WikiPageSyncTaskEntity();
        task.setId(1L);
        task.setProject(project);
        task.setPage(page);
        task.setOperation("RETAIN");
        task.setDocumentId("wiki-page:101");
        task.setStatus("PENDING");
        task.setNextAttemptAt(LocalDateTime.now().minusMinutes(1));

        when(wikiPageSyncTaskRepository.claimQueuedTask(
                eq(1L),
                eq("PENDING"),
                eq("RUNNING"),
                any(LocalDateTime.class),
                any(LocalDateTime.class)
        )).thenReturn(1);
        when(wikiPageSyncTaskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(wikiPageSyncTaskRepository.save(any(WikiPageSyncTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageRepository.save(any(WikiPageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        wikiPageService.consumeQueuedSyncTask(1L, false);

        verify(wikiKnowledgeSearchService).indexProjectPage(page);
        verify(hindsightClientService, org.mockito.Mockito.never()).retainWikiDocument(any(), any(), any(), any(), any(), any());
    }

    @Test
    void shouldSkipProjectWikiSyncWhenClaimFails() {
        WikiPageService wikiPageService = new WikiPageService(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService,
                wikiKnowledgeSearchService,
                wikiSyncQueuePublisher
        );
        when(wikiPageSyncTaskRepository.claimQueuedTask(
                eq(99L),
                eq("PENDING"),
                eq("RUNNING"),
                any(LocalDateTime.class),
                any(LocalDateTime.class)
        )).thenReturn(0);

        boolean consumed = wikiPageService.consumeQueuedSyncTask(99L, false);

        assertThat(consumed).isFalse();
        verify(wikiPageSyncTaskRepository, never()).findById(99L);
        verify(wikiKnowledgeSearchService, never()).indexProjectPage(any());
    }

    @Test
    void shouldRepublishPendingProjectWikiSyncTaskForRabbitCompensation() {
        WikiPageService wikiPageService = new WikiPageService(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService,
                wikiKnowledgeSearchService,
                wikiSyncQueuePublisher
        );
        WikiPageSyncTaskEntity task = new WikiPageSyncTaskEntity();
        task.setId(11L);
        task.setStatus("PENDING");
        task.setNextAttemptAt(LocalDateTime.now().minusMinutes(1));
        when(wikiPageSyncTaskRepository.findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                eq("PENDING"),
                any(LocalDateTime.class),
                any(org.springframework.data.domain.PageRequest.class)
        )).thenReturn(java.util.List.of(task));

        wikiPageService.processPendingSyncTasks();

        verify(wikiSyncQueuePublisher).publishNow(WikiSyncQueuePublisher.TYPE_PROJECT_WIKI, 11L);
        verify(wikiKnowledgeSearchService, never()).indexProjectPage(any());
    }
}
