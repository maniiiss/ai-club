package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.HermesFileLibraryItemEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.HermesFileLibraryItemSummary;
import com.aiclub.platform.dto.request.UpdateHermesFileLibraryItemRequest;
import com.aiclub.platform.repository.HermesFileLibraryItemRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证 Hermes 个人文件库的归属隔离、文档转换与 Qdrant 向量索引行为。
 */
@ExtendWith(MockitoExtension.class)
class HermesFileLibraryServiceTests {

    @Mock
    private AuthService authService;

    @Mock
    private DocumentAssetService documentAssetService;

    @Mock
    private DocumentMarkdownService documentMarkdownService;

    @Mock
    private HermesFileLibraryItemRepository hermesFileLibraryItemRepository;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private QdrantClientService qdrantClientService;

    @Test
    void shouldUploadConvertBindAndIndexPersonalFile() {
        HermesFileLibraryService service = createService();
        CurrentUserInfo currentUser = currentUser();
        UserEntity owner = ownerUser(5L);
        DocumentAssetEntity asset = documentAsset(101L, owner, "需求说明.pdf");
        MockMultipartFile file = new MockMultipartFile("file", "需求说明.pdf", "application/pdf", "hello".getBytes());

        when(authService.currentUser()).thenReturn(currentUser);
        when(documentAssetService.uploadAsset(file, "hermes-file-library"))
                .thenReturn(new DocumentAssetSummary(101L, "需求说明.pdf", "application/pdf", 5L, "PDF", "TEMP", "/api/common/files/101"));
        when(documentAssetService.requireAccessibleAsset(101L)).thenReturn(asset);
        when(documentMarkdownService.convert(101L, DocumentMarkdownService.SCENE_HERMES_FILE_LIBRARY, null))
                .thenReturn(new DocumentMarkdownResult(101L, "需求说明.pdf", "需求说明", "PDF", "# 需求说明\n\n登录要支持短信验证码。", false, List.of("图片已跳过")));
        when(documentAssetService.bindAsset(eq(asset), eq(DocumentAssetService.BIZ_TYPE_HERMES_FILE_LIBRARY), any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesFileLibraryItemRepository.save(any(HermesFileLibraryItemEntity.class)))
                .thenAnswer(invocation -> {
                    HermesFileLibraryItemEntity item = invocation.getArgument(0);
                    if (item.getId() == null) {
                        item.setId(77L);
                    }
                    item.setCreatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
                    item.setUpdatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
                    return item;
                });

        when(modelConfigService.generateEmbeddings(eq(9L), any())).thenReturn(List.of(List.of(0.1d, 0.2d, 0.3d)));

        HermesFileLibraryItemSummary summary = service.upload(file);

        ArgumentCaptor<List<QdrantClientService.QdrantPoint>> pointsCaptor = ArgumentCaptor.forClass(List.class);
        verify(documentAssetService).bindAsset(asset, DocumentAssetService.BIZ_TYPE_HERMES_FILE_LIBRARY, 77L);
        verify(qdrantClientService).deletePointsByFilter("hermes_file_library_chunks", Map.of("ownerUserId", 5L, "itemId", 77L));
        verify(qdrantClientService).upsertPoints(eq("hermes_file_library_chunks"), pointsCaptor.capture());
        assertThat(summary.id()).isEqualTo(77L);
        assertThat(summary.title()).isEqualTo("需求说明");
        assertThat(summary.enabled()).isTrue();
        assertThat(summary.indexStatus()).isEqualTo("INDEXED");
        assertThat(summary.warnings()).containsExactly("图片已跳过");
        assertThat(pointsCaptor.getValue()).hasSize(1);
        assertThat(pointsCaptor.getValue().get(0).payload()).containsEntry("ownerUserId", 5L);
        assertThat(pointsCaptor.getValue().get(0).payload()).containsEntry("itemId", 77L);
    }

    @Test
    void shouldListOnlyCurrentUserItems() {
        HermesFileLibraryService service = createService();
        CurrentUserInfo currentUser = currentUser();
        when(authService.currentUser()).thenReturn(currentUser);
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndTitleContainingIgnoreCaseOrderByUpdatedAtDescIdDesc(5L, "需求"))
                .thenReturn(List.of(fileItem(77L, ownerUser(5L), true, "INDEXED")));

        List<HermesFileLibraryItemSummary> summaries = service.list("需求");

        assertThat(summaries).hasSize(1);
        assertThat(summaries.get(0).id()).isEqualTo(77L);
        verify(hermesFileLibraryItemRepository).findAllByOwnerUser_IdAndTitleContainingIgnoreCaseOrderByUpdatedAtDescIdDesc(5L, "需求");
    }

    @Test
    void shouldDeleteOwnedItemAndQdrantVectors() {
        HermesFileLibraryService service = createService();
        CurrentUserInfo currentUser = currentUser();
        when(authService.currentUser()).thenReturn(currentUser);
        when(hermesFileLibraryItemRepository.findByIdAndOwnerUser_Id(77L, 5L))
                .thenReturn(Optional.of(fileItem(77L, ownerUser(5L), true, "INDEXED")));

        service.delete(77L);

        verify(qdrantClientService).deletePointsByFilter("hermes_file_library_chunks", Map.of("ownerUserId", 5L, "itemId", 77L));
        verify(hermesFileLibraryItemRepository).delete(any(HermesFileLibraryItemEntity.class));
    }

    @Test
    void shouldSkipDisabledItemsWhenBuildingEvidence() {
        HermesFileLibraryService service = createService();
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of());

        String markdown = service.buildEvidenceMarkdown(currentUser(), "登录验证码");

        assertThat(markdown).isBlank();
        verify(modelConfigService, never()).generateEmbedding(any(Long.class), any(String.class));
        verify(qdrantClientService, never()).search(any(), any(), any(), anyInt());
    }

    @Test
    void shouldRecallPersonalFileEvidenceFromQdrant() {
        HermesFileLibraryService service = createService();
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of(fileItem(77L, ownerUser(5L), true, "INDEXED")));
        when(modelConfigService.generateEmbedding(9L, "登录验证码")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(
                "hermes_file_library_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("ownerUserId", 5L, "enabled", true),
                5
        )).thenReturn(List.of(new QdrantClientService.QdrantSearchHit(
                "hit-1",
                0.91d,
                Map.of(
                        "itemId", 77L,
                        "title", "需求说明",
                        "plainText", "登录流程需要支持短信验证码，并在失败时提示可重试。"
                )
        )));

        String markdown = service.buildEvidenceMarkdown(currentUser(), "登录验证码");

        assertThat(markdown).contains("个人文件库证据");
        assertThat(markdown).contains("需求说明");
        assertThat(markdown).contains("短信验证码");
        verify(qdrantClientService).search(
                "hermes_file_library_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("ownerUserId", 5L, "enabled", true),
                5
        );
    }

    @Test
    void shouldReportVectorSearchMissInsteadOfUsingMarkdownFallback() {
        HermesFileLibraryService service = createService();
        HermesFileLibraryItemEntity item = fileItem(77L, ownerUser(5L), true, "INDEXED");
        item.setTitle("2025年述职报告");
        item.setMarkdown("# 2025年述职报告\n\n年度重点包括 CRM 项目交付、Hermes 助手知识库建设和测试自动化推进。");
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of(item));
        when(modelConfigService.generateEmbedding(9L, "我的简历里写了什么")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(
                "hermes_file_library_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("ownerUserId", 5L, "enabled", true),
                5
        )).thenReturn(List.of());

        String markdown = service.buildEvidenceMarkdown(currentUser(), "我的简历里写了什么");

        assertThat(markdown).isBlank();
        assertThat(markdown).doesNotContain("CRM 项目交付");
        assertThat(markdown).doesNotContain("Hermes 助手知识库建设");
    }

    @Test
    void shouldFallbackToIndexedFileTitleWhenVectorSearchMissesShortNameQuery() {
        HermesFileLibraryService service = createService();
        HermesFileLibraryItemEntity item = fileItem(77L, ownerUser(5L), true, "INDEXED");
        item.setTitle("杜立宏简历");
        item.getDocumentAsset().setFileName("杜立宏简历.docx");
        item.setMarkdown("# 杜立宏简历\n\n杜立宏曾负责 CRM 项目交付、智能助手建设和自动化测试推进。");
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of(item));
        when(modelConfigService.generateEmbedding(9L, "杜立宏是谁")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(
                "hermes_file_library_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("ownerUserId", 5L, "enabled", true),
                5
        )).thenReturn(List.of());

        String markdown = service.buildEvidenceMarkdown(currentUser(), "杜立宏是谁");

        assertThat(markdown).contains("个人文件库证据");
        assertThat(markdown).contains("杜立宏简历");
        assertThat(markdown).contains("CRM 项目交付");
        assertThat(markdown).contains("文件标题命中");
    }

    @Test
    void shouldReportIndexFailureWhenPersonalDocumentVectorIndexIsNotReady() {
        HermesFileLibraryService service = createService();
        HermesFileLibraryItemEntity item = fileItem(77L, ownerUser(5L), true, "FAILED");
        item.setTitle("2025年述职报告");
        item.setMarkdown("# 2025年述职报告\n\n工作成果包括 CRM 项目交付、个人知识库文档上传和自动化测试建设。");
        item.setLastError("Hermes 文件库向量索引未启用或未配置 Embedding 模型");
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of(item));

        String markdown = service.buildEvidenceMarkdown(currentUser(), "我的简历");

        assertThat(markdown).isBlank();
        assertThat(markdown).doesNotContain("个人知识库文档上传");
        verify(modelConfigService, never()).generateEmbedding(any(Long.class), any(String.class));
        verify(qdrantClientService, never()).search(any(), any(), any(), anyInt());
    }

    @Test
    void shouldIgnoreVectorHitsFromItemsThatAreNotIndexed() {
        HermesFileLibraryService service = createService();
        HermesFileLibraryItemEntity indexedItem = fileItem(77L, ownerUser(5L), true, "INDEXED");
        HermesFileLibraryItemEntity failedItem = fileItem(88L, ownerUser(5L), true, "FAILED");
        failedItem.setTitle("2025年述职报告");
        failedItem.setMarkdown("# 2025年述职报告\n\n不应被召回的 Markdown 内容。");
        when(hermesFileLibraryItemRepository.findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(5L))
                .thenReturn(List.of(failedItem, indexedItem));
        when(modelConfigService.generateEmbedding(9L, "我的年终述职报告有哪些内容")).thenReturn(List.of(0.1d, 0.2d, 0.3d));
        when(qdrantClientService.search(
                "hermes_file_library_chunks",
                List.of(0.1d, 0.2d, 0.3d),
                Map.of("ownerUserId", 5L, "enabled", true),
                5
        )).thenReturn(List.of(new QdrantClientService.QdrantSearchHit(
                "stale-hit",
                0.88d,
                Map.of(
                        "itemId", 88L,
                        "title", "2025年述职报告",
                        "plainText", "不应被召回的 Markdown 内容。"
                )
        )));

        String markdown = service.buildEvidenceMarkdown(currentUser(), "我的年终述职报告有哪些内容");

        assertThat(markdown).isBlank();
        assertThat(markdown).doesNotContain("不应被召回");
    }

    @Test
    void shouldMarkUploadFailedWhenVectorizationDoesNotComplete() {
        HermesFileLibraryService service = createService();
        CurrentUserInfo currentUser = currentUser();
        UserEntity owner = ownerUser(5L);
        DocumentAssetEntity asset = documentAsset(101L, owner, "空文档.pdf");
        MockMultipartFile file = new MockMultipartFile("file", "空文档.pdf", "application/pdf", "hello".getBytes());

        when(authService.currentUser()).thenReturn(currentUser);
        when(documentAssetService.uploadAsset(file, "hermes-file-library"))
                .thenReturn(new DocumentAssetSummary(101L, "空文档.pdf", "application/pdf", 5L, "PDF", "TEMP", "/api/common/files/101"));
        when(documentAssetService.requireAccessibleAsset(101L)).thenReturn(asset);
        when(documentMarkdownService.convert(101L, DocumentMarkdownService.SCENE_HERMES_FILE_LIBRARY, null))
                .thenReturn(new DocumentMarkdownResult(101L, "空文档.pdf", "空文档", "PDF", "# 空文档", false, List.of()));
        when(documentAssetService.bindAsset(eq(asset), eq(DocumentAssetService.BIZ_TYPE_HERMES_FILE_LIBRARY), any()))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(hermesFileLibraryItemRepository.save(any(HermesFileLibraryItemEntity.class)))
                .thenAnswer(invocation -> {
                    HermesFileLibraryItemEntity item = invocation.getArgument(0);
                    if (item.getId() == null) {
                        item.setId(77L);
                    }
                    item.setCreatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
                    item.setUpdatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
                    return item;
                });
        when(modelConfigService.generateEmbeddings(eq(9L), any())).thenReturn(List.of());

        HermesFileLibraryItemSummary summary = service.upload(file);

        assertThat(summary.indexStatus()).isEqualTo("FAILED");
        assertThat(summary.lastError()).contains("切片向量化未完成");
        verify(qdrantClientService, never()).upsertPoints(any(), any());
    }

    @Test
    void shouldRecordReindexFailure() {
        HermesFileLibraryService service = createService();
        CurrentUserInfo currentUser = currentUser();
        HermesFileLibraryItemEntity item = fileItem(77L, ownerUser(5L), true, "FAILED");
        when(authService.currentUser()).thenReturn(currentUser);
        when(hermesFileLibraryItemRepository.findByIdAndOwnerUser_Id(77L, 5L)).thenReturn(Optional.of(item));
        when(documentMarkdownService.convert(101L, DocumentMarkdownService.SCENE_HERMES_FILE_LIBRARY, null))
                .thenThrow(new IllegalStateException("转换服务不可用"));
        when(hermesFileLibraryItemRepository.save(any(HermesFileLibraryItemEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        HermesFileLibraryItemSummary summary = service.reindex(77L);

        assertThat(summary.indexStatus()).isEqualTo("FAILED");
        assertThat(summary.lastError()).contains("转换服务不可用");
    }

    private HermesFileLibraryService createService() {
        return new HermesFileLibraryService(
                authService,
                documentAssetService,
                documentMarkdownService,
                hermesFileLibraryItemRepository,
                wikiKnowledgeProperties(),
                new WikiChunkingService(),
                modelConfigService,
                qdrantClientService,
                new ObjectMapper()
        );
    }

    private WikiKnowledgeProperties wikiKnowledgeProperties() {
        return new WikiKnowledgeProperties(
                true,
                "http://localhost:6333",
                "",
                20,
                "wiki_project_chunks",
                "wiki_space_chunks",
                "hermes_file_library_chunks",
                9L,
                "",
                "",
                "",
                "OPENAI",
                12,
                24,
                "",
                "",
                "",
                "openai-compatible",
                15,
                10,
                0.78,
                6,
                256
        );
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                5L,
                "pm-user",
                "项目经理",
                "",
                "",
                "",
                "",
                true,
                List.of("PM"),
                List.of("项目经理"),
                List.of("hermes:chat"),
                List.of()
        );
    }

    private UserEntity ownerUser(Long id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setUsername("pm-user");
        user.setNickname("项目经理");
        return user;
    }

    private DocumentAssetEntity documentAsset(Long id, UserEntity owner, String fileName) {
        DocumentAssetEntity asset = new DocumentAssetEntity();
        asset.setId(id);
        asset.setOwnerUser(owner);
        asset.setFileName(fileName);
        asset.setContentType("application/pdf");
        asset.setFileSize(5L);
        asset.setSourceFormat("PDF");
        return asset;
    }

    private HermesFileLibraryItemEntity fileItem(Long id, UserEntity owner, boolean enabled, String indexStatus) {
        HermesFileLibraryItemEntity item = new HermesFileLibraryItemEntity();
        item.setId(id);
        item.setOwnerUser(owner);
        item.setDocumentAsset(documentAsset(101L, owner, "需求说明.pdf"));
        item.setTitle("需求说明");
        item.setDescription("个人知识库文件");
        item.setMarkdown("# 需求说明\n\n登录要支持短信验证码。");
        item.setSourceFormat("PDF");
        item.setFileSize(5L);
        item.setEnabled(enabled);
        item.setIndexStatus(indexStatus);
        item.setWarningsJson("[]");
        item.setLastError("");
        item.setCreatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
        item.setUpdatedAt(LocalDateTime.of(2026, 7, 4, 10, 0));
        return item;
    }
}
