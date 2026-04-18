package com.aiclub.platform.service;

import com.aiclub.platform.dto.PlatformToolDefinition;
import com.aiclub.platform.repository.PlatformToolConfigRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 验证平台工具注册中心会把 Wiki 能力稳定暴露给 Hermes。
 */
@ExtendWith(MockitoExtension.class)
class PlatformToolRegistryTests {

    @Mock
    private PlatformToolConfigRepository platformToolConfigRepository;

    /**
     * Wiki 搜索和页面详情工具都应被正式注册，否则 Hermes 即使有执行器实现也无法看到能力目录。
     */
    @Test
    void shouldRegisterWikiToolsForHermes() {
        when(platformToolConfigRepository.findByToolCode(anyString())).thenReturn(Optional.empty());

        PlatformToolRegistry registry = new PlatformToolRegistry(platformToolConfigRepository);

        assertThat(registry.listDefinitions())
                .extracting(PlatformToolDefinition::code)
                .contains(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH, PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL);

        PlatformToolDefinition wikiSearch = registry.requireDefinition(PlatformToolRegistry.TOOL_WIKI_SPACE_SEARCH);
        assertThat(wikiSearch.permissionCode()).isEqualTo("wiki:view");
        assertThat(wikiSearch.readOnly()).isTrue();
        assertThat(wikiSearch.inputSchema())
                .containsEntry("query", "Wiki 查询语句")
                .containsEntry("spaceId", "Wiki 空间ID，可选")
                .containsEntry("projectId", "绑定项目ID，可选");
        assertThat(wikiSearch.outputSchema())
                .containsEntry("candidates[].payload.spaceId", "所属 Wiki 空间ID")
                .containsEntry("candidates[].payload.pageId", "Wiki 页面ID");

        PlatformToolDefinition wikiDetail = registry.requireDefinition(PlatformToolRegistry.TOOL_WIKI_PAGE_GET_DETAIL);
        assertThat(wikiDetail.permissionCode()).isEqualTo("wiki:view");
        assertThat(wikiDetail.readOnly()).isTrue();
        assertThat(wikiDetail.inputSchema())
                .containsEntry("spaceId", "Wiki 空间ID")
                .containsEntry("pageId", "Wiki 页面ID");
        assertThat(wikiDetail.outputSchema())
                .containsEntry("candidates[].payload.content", "页面正文内容摘要")
                .containsEntry("metadata.pageId", "读取的页面ID");
    }
}
