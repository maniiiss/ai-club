package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 验证文档转换服务会把图片目录继续传给 code-processing。
 */
@ExtendWith(MockitoExtension.class)
class DocumentMarkdownServiceTests {

    @Mock
    private DocumentAssetService documentAssetService;

    @Mock
    private DocumentMarkdownClientService documentMarkdownClientService;

    @Test
    void shouldPassImageDirectoryToClientWhenProvided() {
        DocumentMarkdownService service = new DocumentMarkdownService(documentAssetService, documentMarkdownClientService);
        byte[] bytes = "demo".getBytes();

        DocumentAssetEntity asset = new DocumentAssetEntity();
        asset.setId(7L);
        asset.setFileName("demo.pdf");
        asset.setContentType("application/pdf");
        asset.setSourceFormat("PDF");

        when(documentAssetService.requireAccessibleAsset(7L)).thenReturn(asset);
        when(documentAssetService.loadContent(asset))
                .thenReturn(new DocumentAssetStorageService.StoredDocumentContent(bytes, "application/pdf"));
        when(documentMarkdownClientService.convert(
                aryEq(bytes),
                eq("demo.pdf"),
                eq("application/pdf"),
                eq(DocumentMarkdownService.SCENE_WIKI_IMPORT),
                eq(200000),
                eq("wiki-spaces/space-1/imports/asset-7")
        )).thenReturn(new DocumentMarkdownClientService.ConvertDocumentResponse(
                "建议标题",
                "# 正文",
                "PDF",
                false,
                List.of()
        ));

        DocumentMarkdownResult result = service.convert(
                7L,
                DocumentMarkdownService.SCENE_WIKI_IMPORT,
                200000,
                "wiki-spaces/space-1/imports/asset-7"
        );

        assertThat(result.markdown()).isEqualTo("# 正文");
        verify(documentMarkdownClientService).convert(
                aryEq(bytes),
                eq("demo.pdf"),
                eq("application/pdf"),
                eq(DocumentMarkdownService.SCENE_WIKI_IMPORT),
                eq(200000),
                eq("wiki-spaces/space-1/imports/asset-7")
        );
    }
}
