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
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证项目 Wiki retain 时会补齐统一项目标签与来源标签，
 * 避免后续记忆事实图按项目过滤时漏掉平台可控的 Wiki 记忆。
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

    @Test
    void shouldAttachProjectAndSourceTagsWhenRetainingWikiPage() {
        WikiPageService wikiPageService = new WikiPageService(
                projectRepository,
                userRepository,
                wikiPageRepository,
                wikiPageVersionRepository,
                wikiPageAccessRepository,
                wikiPageSyncTaskRepository,
                projectDataPermissionService,
                hindsightClientService
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

        when(wikiPageSyncTaskRepository.findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
                org.mockito.ArgumentMatchers.eq("PENDING"),
                any(LocalDateTime.class),
                any(PageRequest.class)
        )).thenReturn(List.of(task));
        when(wikiPageSyncTaskRepository.save(any(WikiPageSyncTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageRepository.save(any(WikiPageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        wikiPageService.processPendingSyncTasks();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> tagsCaptor = ArgumentCaptor.forClass((Class) List.class);
        verify(hindsightClientService).retainWikiDocument(
                org.mockito.ArgumentMatchers.eq(12L),
                org.mockito.ArgumentMatchers.eq("wiki-page:101"),
                org.mockito.ArgumentMatchers.eq("发布说明"),
                org.mockito.ArgumentMatchers.anyString(),
                tagsCaptor.capture(),
                org.mockito.ArgumentMatchers.anyMap()
        );
        assertThat(tagsCaptor.getValue()).contains("wiki", "source:wiki", "project:12");
    }
}
