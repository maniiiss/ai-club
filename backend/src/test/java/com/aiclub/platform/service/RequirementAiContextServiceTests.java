package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.TaskAttachmentEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskWorkItemRelationEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import com.aiclub.platform.dto.RequirementAiPreparedContext;
import com.aiclub.platform.dto.RequirementAiTaskSnapshot;
import com.aiclub.platform.repository.TaskAttachmentRepository;
import com.aiclub.platform.repository.TaskWorkItemRelationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RequirementAiContextServiceTests {

    @Mock
    private TaskAttachmentRepository taskAttachmentRepository;

    @Mock
    private TaskWorkItemRelationRepository taskWorkItemRelationRepository;

    @Mock
    private DocumentMarkdownService documentMarkdownService;

    @Mock
    private DocumentAssetService documentAssetService;

    private RequirementAiContextService contextService;

    @BeforeEach
    void setUp() {
        contextService = new RequirementAiContextService(
                taskAttachmentRepository,
                taskWorkItemRelationRepository,
                documentMarkdownService,
                documentAssetService
        );
    }

    /**
     * 上下文必须限制附件数量和单附件长度，并且仅收集平台图片资产。
     */
    @Test
    void shouldLimitAttachmentsAndPlatformImages() {
        RequirementAiTaskSnapshot snapshot = snapshotWithDescription(buildPlatformImageMarkdown(10)
                + "\n![外部图片](https://example.com/a.png)");
        List<TaskAttachmentEntity> attachments = new ArrayList<>();
        for (long id = 1; id <= 6; id++) {
            attachments.add(attachment(id, "说明-" + id + ".pdf", "application/pdf"));
        }
        when(taskAttachmentRepository.findAllByTask_IdOrderByCreatedAtAscIdAsc(1L)).thenReturn(attachments);
        when(taskWorkItemRelationRepository.findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(any(), any()))
                .thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(any(), any()))
                .thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(any(), any(), any(), any()))
                .thenReturn(List.of());
        when(documentMarkdownService.convertAsset(any(DocumentAssetEntity.class), eq("REQUIREMENT_AI_CONTEXT"), eq(8000)))
                .thenAnswer(invocation -> {
                    DocumentAssetEntity asset = invocation.getArgument(0);
                    return new DocumentMarkdownResult(asset.getId(), asset.getFileName(), "", "PDF", "x".repeat(9000), true, List.of("原文较长"));
                });
        for (long id = 101; id <= 108; id++) {
            when(documentAssetService.requireAsset(id)).thenReturn(asset(id, "image-" + id + ".png", "image/png"));
        }

        RequirementAiPreparedContext context = contextService.prepare(snapshot);

        assertThat(context.markdown()).contains("说明-1.pdf").contains("说明-5.pdf").doesNotContain("说明-6.pdf");
        assertThat(context.markdown()).doesNotContain("x".repeat(8001));
        assertThat(context.images()).hasSize(8);
        assertThat(context.images()).allMatch(image -> image.assetId() >= 101 && image.assetId() <= 108);
        assertThat(context.stats()).containsEntry("attachmentIncluded", 5).containsEntry("imageIncluded", 8);
        assertThat(context.warnings()).anyMatch(item -> item.contains("附件最多读取 5 个"));
        assertThat(context.warnings()).anyMatch(item -> item.contains("图片最多读取 8 张"));
    }

    /**
     * 关联工作项最多保留十条，每条描述摘要最多五百字符。
     */
    @Test
    void shouldLimitLinkedWorkItemsAndSummaryLength() {
        when(taskAttachmentRepository.findAllByTask_IdOrderByCreatedAtAscIdAsc(1L)).thenReturn(List.of());
        List<TaskWorkItemRelationEntity> relations = new ArrayList<>();
        TaskEntity source = task(1L, "当前需求", "当前描述");
        for (long id = 2; id <= 13; id++) {
            TaskWorkItemRelationEntity relation = new TaskWorkItemRelationEntity();
            relation.setSourceTask(source);
            relation.setTargetTask(task(id, "关联工作项-" + id, "d".repeat(700)));
            relation.setRelationType("RELATED");
            relations.add(relation);
        }
        when(taskWorkItemRelationRepository.findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(1L, "CHILD"))
                .thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(1L, "CHILD"))
                .thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(
                "RELATED", 1L, "RELATED", 1L)).thenReturn(relations);

        RequirementAiPreparedContext context = contextService.prepare(snapshotWithDescription("当前描述"));

        assertThat(context.stats()).containsEntry("linkedWorkItemIncluded", 10);
        assertThat(context.markdown()).contains("关联工作项-11").doesNotContain("关联工作项-12");
        assertThat(context.markdown()).doesNotContain("d".repeat(501));
        assertThat(context.warnings()).anyMatch(item -> item.contains("关联工作项最多读取 10 个"));
    }

    /**
     * 需求编辑器把图片 Markdown 保存在 requirementMarkdown，不能只读取普通描述字段。
     */
    @Test
    void shouldCollectImagesFromRequirementMarkdownSnapshot() {
        RequirementAiTaskSnapshot snapshot = new RequirementAiTaskSnapshot(
                1L,
                "STANDARDIZE",
                "带原型图片的需求",
                "需求",
                null,
                "演示项目",
                "未规划",
                "草稿",
                "高",
                "",
                "",
                "![登录原型](http://localhost:5173/api/common/public-files/501?inline=true)",
                null,
                null
        );
        when(taskAttachmentRepository.findAllByTask_IdOrderByCreatedAtAscIdAsc(1L)).thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllBySourceTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(any(), any())).thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByTargetTask_IdAndRelationTypeOrderByCreatedAtAscIdAsc(any(), any())).thenReturn(List.of());
        when(taskWorkItemRelationRepository.findAllByRelationTypeAndSourceTask_IdOrRelationTypeAndTargetTask_IdOrderByCreatedAtAscIdAsc(any(), any(), any(), any())).thenReturn(List.of());
        when(documentAssetService.requireAsset(501L)).thenReturn(asset(501L, "login.png", "image/png"));

        RequirementAiPreparedContext context = contextService.prepare(snapshot);

        assertThat(context.images()).singleElement().satisfies(image -> {
            assertThat(image.assetId()).isEqualTo(501L);
            assertThat(image.sourceName()).isEqualTo("login.png");
        });
    }

    /** 工作项快照必须携带需求编辑器保存的 Markdown，而不是只保存普通描述。 */
    @Test
    void shouldSnapshotRequirementMarkdownFromTask() {
        TaskEntity task = task(1L, "带图片需求", "普通描述");
        com.aiclub.platform.domain.model.ProjectEntity project =
                new com.aiclub.platform.domain.model.ProjectEntity("演示项目", "张三", "进行中", "");
        task.setProject(project);
        task.setWorkItemType("需求");
        task.setRequirementMarkdown("![原型](http://localhost/api/common/public-files/601?inline=true)");

        RequirementAiTaskSnapshot snapshot = contextService.snapshot(task, "STANDARDIZE");

        assertThat(snapshot.requirementMarkdown()).contains("/api/common/public-files/601");
    }

    private RequirementAiTaskSnapshot snapshotWithDescription(String description) {
        return new RequirementAiTaskSnapshot(
                1L,
                "TEST_CASES",
                "当前需求",
                "需求",
                null,
                "演示项目",
                "未规划",
                "草稿",
                "高",
                "https://example.com/prototype",
                description,
                "",
                null,
                null
        );
    }

    private String buildPlatformImageMarkdown(int count) {
        StringBuilder markdown = new StringBuilder();
        for (int index = 1; index <= count; index++) {
            markdown.append("![图片").append(index).append("](/api/common/files/").append(100 + index).append(")\n");
        }
        return markdown.toString();
    }

    private TaskAttachmentEntity attachment(long id, String fileName, String contentType) {
        TaskAttachmentEntity attachment = new TaskAttachmentEntity();
        attachment.setId(id);
        attachment.setDocumentAsset(asset(id, fileName, contentType));
        return attachment;
    }

    private DocumentAssetEntity asset(long id, String fileName, String contentType) {
        DocumentAssetEntity asset = new DocumentAssetEntity();
        asset.setId(id);
        asset.setFileName(fileName);
        asset.setContentType(contentType);
        return asset;
    }

    private TaskEntity task(long id, String name, String description) {
        TaskEntity task = new TaskEntity();
        task.setId(id);
        task.setName(name);
        task.setWorkItemType("任务");
        task.setStatus("待开始");
        task.setPriority("中");
        task.setDescription(description);
        return task;
    }
}
