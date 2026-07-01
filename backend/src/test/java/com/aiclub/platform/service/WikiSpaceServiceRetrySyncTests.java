package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.WikiSpacePageDetail;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证空间 Wiki 页面同步失败后，可以手动重新加入 Hindsight 同步队列。
 */
@ExtendWith(MockitoExtension.class)
class WikiSpaceServiceRetrySyncTests {

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

    @Mock
    private WikiSyncQueuePublisher wikiSyncQueuePublisher;

    @Test
    void shouldResetLatestRetainTaskAndPageStatusWhenRetryingFailedSync() {
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
                wikiKnowledgeSearchService,
                null,
                null,
                null,
                wikiSyncQueuePublisher
        );

        UserEntity user = new UserEntity();
        user.setId(1L);
        user.setUsername("tester");
        user.setNickname("测试用户");

        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(9L);
        space.setName("测试空间");

        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(20L);
        directory.setName("产品目录");
        directory.setSpace(space);

        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(201L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("失败页面");
        page.setSlug("failed-page");
        page.setContent("页面正文");
        page.setAuthorUser(user);
        page.setSyncStatus("FAILED");
        page.setLastSyncError("Hindsight 请求失败：request timed out");

        WikiPageSyncTaskV2Entity task = new WikiPageSyncTaskV2Entity();
        task.setId(7L);
        task.setSpace(space);
        task.setPage(page);
        task.setOperation("RETAIN");
        task.setDocumentId("wiki-page-v2:201");
        task.setStatus("FAILED");
        task.setAttemptCount(4);
        task.setNextAttemptAt(LocalDateTime.now().plusHours(2));
        task.setLastError("旧错误");

        AuthContextHolder.set(new AuthContext(
                1L,
                "tester",
                "测试用户",
                Set.of("SUPER_ADMIN"),
                Set.of("wiki:view")
        ));
        try {
            when(userRepository.findWithDetailsById(1L)).thenReturn(Optional.of(user));
            when(wikiPageV2Repository.findDetailBySpace_IdAndId(9L, 201L)).thenReturn(Optional.of(page));
            when(wikiPageSyncTaskV2Repository.findFirstByPage_IdAndOperationOrderByIdDesc(201L, "RETAIN"))
                    .thenReturn(Optional.of(task));
            when(wikiPageSyncTaskV2Repository.save(any(WikiPageSyncTaskV2Entity.class))).thenAnswer(invocation -> invocation.getArgument(0));
            when(wikiPageV2Repository.save(any(WikiPageV2Entity.class))).thenAnswer(invocation -> invocation.getArgument(0));

            WikiSpacePageDetail detail = wikiSpaceService.retryPageSync(9L, 201L);

            ArgumentCaptor<WikiPageSyncTaskV2Entity> taskCaptor = ArgumentCaptor.forClass(WikiPageSyncTaskV2Entity.class);
            verify(wikiPageSyncTaskV2Repository).save(taskCaptor.capture());
            WikiPageSyncTaskV2Entity savedTask = taskCaptor.getValue();
            assertThat(savedTask.getStatus()).isEqualTo("PENDING");
            assertThat(savedTask.getAttemptCount()).isZero();
            assertThat(savedTask.getLastError()).isEmpty();
            assertThat(savedTask.getNextAttemptAt()).isNotNull();

            assertThat(detail.syncStatus()).isEqualTo("PENDING");
            assertThat(detail.lastSyncError()).isEmpty();
            verify(wikiSyncQueuePublisher).publishAfterCommit(WikiSyncQueuePublisher.TYPE_SPACE_WIKI, 7L);
        } finally {
            AuthContextHolder.clear();
        }
    }
}
