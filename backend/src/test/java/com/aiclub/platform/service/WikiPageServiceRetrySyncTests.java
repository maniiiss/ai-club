package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiPageEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskEntity;
import com.aiclub.platform.dto.WikiPageDetail;
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
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证项目 Wiki 页面同步失败后，可以手动重新加入 Hindsight 同步队列。
 */
@ExtendWith(MockitoExtension.class)
class WikiPageServiceRetrySyncTests {

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
    void shouldResetLatestRetainTaskAndPageStatusWhenRetryingFailedSync() {
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
        author.setNickname("测试用户");

        WikiPageEntity page = new WikiPageEntity();
        page.setId(101L);
        page.setProject(project);
        page.setTitle("失败页面");
        page.setSlug("failed-page");
        page.setContent("页面正文");
        page.setVisibilityScope(WikiPageService.VISIBILITY_PROJECT_MEMBERS);
        page.setAuthorUser(author);
        page.setSyncStatus("FAILED");
        page.setLastSyncError("Hindsight 请求失败：request timed out");

        WikiPageSyncTaskEntity task = new WikiPageSyncTaskEntity();
        task.setId(5L);
        task.setProject(project);
        task.setPage(page);
        task.setOperation("RETAIN");
        task.setDocumentId("wiki-page:101");
        task.setStatus("FAILED");
        task.setAttemptCount(3);
        task.setNextAttemptAt(LocalDateTime.now().plusMinutes(30));
        task.setLastError("旧错误");

        ProjectDataPermissionService.ProjectDataScope scope =
                new ProjectDataPermissionService.ProjectDataScope(1L, true, null);

        when(wikiPageRepository.findByProject_IdAndId(12L, 101L)).thenReturn(Optional.of(page));
        when(projectDataPermissionService.requireCurrentScope()).thenReturn(scope);
        when(projectDataPermissionService.canEditProject(project, scope)).thenReturn(true);
        when(wikiPageSyncTaskRepository.findFirstByPage_IdAndOperationOrderByIdDesc(101L, "RETAIN"))
                .thenReturn(Optional.of(task));
        when(wikiPageSyncTaskRepository.save(any(WikiPageSyncTaskEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageRepository.save(any(WikiPageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(wikiPageAccessRepository.findAllByPage_Id(101L)).thenReturn(List.of());

        WikiPageDetail detail = wikiPageService.retryPageSync(12L, 101L);

        ArgumentCaptor<WikiPageSyncTaskEntity> taskCaptor = ArgumentCaptor.forClass(WikiPageSyncTaskEntity.class);
        verify(wikiPageSyncTaskRepository).save(taskCaptor.capture());
        WikiPageSyncTaskEntity savedTask = taskCaptor.getValue();
        assertThat(savedTask.getStatus()).isEqualTo("PENDING");
        assertThat(savedTask.getAttemptCount()).isZero();
        assertThat(savedTask.getLastError()).isEmpty();
        assertThat(savedTask.getNextAttemptAt()).isNotNull();

        assertThat(detail.syncStatus()).isEqualTo("PENDING");
        assertThat(detail.lastSyncError()).isEmpty();
    }
}
