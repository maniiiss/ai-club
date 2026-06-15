package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.domain.model.TaskPrdProjectionEntity;
import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.domain.model.WikiSpaceEntity;
import com.aiclub.platform.dto.TaskPrdAnalyzeResult;
import com.aiclub.platform.dto.WikiSpacePageSummary;
import com.aiclub.platform.dto.request.TaskPrdAnalyzeRequest;
import com.aiclub.platform.repository.AiModelConfigRepository;
import com.aiclub.platform.repository.TaskPrdProjectionRepository;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.repository.WikiSpaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 覆盖 PRD AI 的模型校验与召回回退行为。
 */
@ExtendWith(MockitoExtension.class)
class TaskPrdServiceTests {

    @Mock
    private TaskRepository taskRepository;

    @Mock
    private TaskPrdProjectionRepository taskPrdProjectionRepository;

    @Mock
    private WikiSpaceRepository wikiSpaceRepository;

    @Mock
    private WikiPageV2Repository wikiPageV2Repository;

    @Mock
    private WikiSpaceService wikiSpaceService;

    @Mock
    private AiModelConfigRepository aiModelConfigRepository;

    @Mock
    private ModelConfigService modelConfigService;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    private TaskPrdService taskPrdService;

    @BeforeEach
    void setUp() {
        taskPrdService = new TaskPrdService(
                taskRepository,
                taskPrdProjectionRepository,
                wikiSpaceRepository,
                wikiPageV2Repository,
                wikiSpaceService,
                aiModelConfigRepository,
                modelConfigService,
                projectDataPermissionService,
                new ObjectMapper()
        );
    }

    /**
     * 显式指定 Embedding 模型时，应在进入 LLM 调用前直接拦截。
     */
    @Test
    void shouldRejectEmbeddingModelWhenPrdAnalyzeUsesExplicitConfig() {
        TaskEntity task = buildRequirementTask();
        TaskPrdProjectionEntity projection = buildProjection(task);
        WikiPageV2Entity page = buildPage();
        AiModelConfigEntity embeddingModel = buildModelConfig(2L, "向量模型", ModelConfigService.MODEL_TYPE_EMBEDDING);

        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(taskPrdProjectionRepository.findByTask_Id(1L)).thenReturn(Optional.of(projection));
        when(wikiPageV2Repository.findDetailBySpace_IdAndId(10L, 20L)).thenReturn(Optional.of(page));
        when(aiModelConfigRepository.findById(2L)).thenReturn(Optional.of(embeddingModel));

        assertThatThrownBy(() -> taskPrdService.analyze(1L, new TaskPrdAnalyzeRequest(TaskPrdService.ACTION_GAP_CHECK, 2L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("PRD AI 仅支持对话模型配置");

        verifyNoInteractions(modelConfigService);
    }

    /**
     * 当语义召回失败时，应回退到关键词搜索，继续产出可用参考结果。
     */
    @Test
    void shouldFallbackToKeywordSearchWhenSemanticRecallFails() {
        TaskEntity task = buildRequirementTask();
        TaskPrdProjectionEntity projection = buildProjection(task);
        WikiPageV2Entity page = buildPage();
        AiModelConfigEntity chatModel = buildModelConfig(3L, "对话模型", ModelConfigService.MODEL_TYPE_CHAT);

        when(taskRepository.findById(1L)).thenReturn(Optional.of(task));
        when(projectDataPermissionService.currentScopeOrNull()).thenReturn(null);
        when(taskPrdProjectionRepository.findByTask_Id(1L)).thenReturn(Optional.of(projection));
        when(wikiPageV2Repository.findDetailBySpace_IdAndId(10L, 20L)).thenReturn(Optional.of(page));
        when(aiModelConfigRepository.findAllByEnabledTrueAndModelTypeOrderByIdAsc(ModelConfigService.MODEL_TYPE_CHAT))
                .thenReturn(List.of(chatModel));
        when(modelConfigService.resolveModelConfig(3L)).thenReturn(new ModelConfigService.ResolvedModelConfig(
                3L,
                "对话模型",
                ModelConfigService.MODEL_TYPE_CHAT,
                ModelConfigService.PROVIDER_OPENAI,
                "https://api.openai.com/v1",
                "gpt-5.4",
                ModelConfigService.OPENAI_API_MODE_AUTO,
                "chat-key"
        ));
        when(wikiSpaceService.semanticSearchPages(anyString(), any(), any())).thenThrow(new IllegalStateException("semantic failed"));
        when(wikiSpaceService.searchPages(anyString(), any(), any())).thenReturn(List.of(new WikiSpacePageSummary(
                30L,
                10L,
                "PRD 空间",
                40L,
                "账户中心",
                null,
                99L,
                "演示项目",
                "参考 PRD",
                "reference-prd",
                1,
                "SYNCED",
                "作者甲",
                true,
                "2026-04-23 12:00:00",
                List.of()
        )));
        when(modelConfigService.invokePrompt(any(ModelConfigService.ResolvedModelConfig.class), anyString(), anyString(), anyInt()))
                .thenReturn("""
                        {
                          "markdown": "## 缺口分析\\n- 需要补充边界条件\\n\\n## 待确认问题\\n- 是否支持批量处理",
                          "gaps": ["需要补充边界条件"],
                          "questions": ["是否支持批量处理"]
                        }
                        """);

        TaskPrdAnalyzeResult result = taskPrdService.analyze(1L, new TaskPrdAnalyzeRequest(TaskPrdService.ACTION_GAP_CHECK, null));

        assertThat(result.gaps()).containsExactly("需要补充边界条件");
        assertThat(result.questions()).containsExactly("是否支持批量处理");
        assertThat(result.references()).hasSize(1);
        assertThat(result.references().get(0).title()).isEqualTo("参考 PRD");
    }

    private TaskEntity buildRequirementTask() {
        ProjectEntity project = new ProjectEntity("演示项目", "张三", "进行中", "PRD 测试项目");
        project.setId(99L);
        TaskEntity task = new TaskEntity();
        task.setId(1L);
        task.setName("登录流程改造");
        task.setWorkItemType("需求");
        task.setStatus("草稿");
        task.setPriority("高");
        task.setModuleName("账户中心");
        task.setRequirementMarkdown("""
                ## 用户故事

                作为用户，我希望登录流程更顺畅。

                ## 需求描述

                需要优化登录页交互。

                ## 验收标准

                1. 登录链路可用。
                """);
        task.setProject(project);
        return task;
    }

    private TaskPrdProjectionEntity buildProjection(TaskEntity task) {
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(10L);
        space.setName("PRD 空间");

        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(40L);
        directory.setName("账户中心");
        directory.setSpace(space);

        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(20L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("#ABC123-登录流程改造");
        page.setContent("## 背景\n\n待完善");
        page.setUpdatedAt(LocalDateTime.now());

        TaskPrdProjectionEntity projection = new TaskPrdProjectionEntity();
        projection.setTask(task);
        projection.setProject(task.getProject());
        projection.setWikiSpace(space);
        projection.setPrdWikiDirectory(directory);
        projection.setPrdWikiPage(page);
        projection.setStatus(TaskPrdService.STATUS_READY);
        return projection;
    }

    private WikiPageV2Entity buildPage() {
        WikiSpaceEntity space = new WikiSpaceEntity();
        space.setId(10L);
        space.setName("PRD 空间");

        WikiDirectoryEntity directory = new WikiDirectoryEntity();
        directory.setId(40L);
        directory.setName("账户中心");
        directory.setSpace(space);

        WikiPageV2Entity page = new WikiPageV2Entity();
        page.setId(20L);
        page.setSpace(space);
        page.setDirectory(directory);
        page.setTitle("#ABC123-登录流程改造");
        page.setContent("## 背景\n\n待完善\n\n## 目标\n\n待完善");
        page.setUpdatedAt(LocalDateTime.now());
        return page;
    }

    private AiModelConfigEntity buildModelConfig(Long id, String name, String modelType) {
        AiModelConfigEntity entity = new AiModelConfigEntity();
        entity.setId(id);
        entity.setName(name);
        entity.setModelType(modelType);
        entity.setProvider(ModelConfigService.PROVIDER_OPENAI);
        entity.setModelName("model-" + id);
        entity.setApiBaseUrl("https://api.openai.com/v1");
        entity.setApiKeyCiphertext("cipher-" + id);
        entity.setEnabled(true);
        return entity;
    }
}
