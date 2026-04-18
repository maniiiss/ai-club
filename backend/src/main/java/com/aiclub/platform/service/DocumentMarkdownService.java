package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.dto.DocumentMarkdownResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 文档转 Markdown 统一服务，供平台工具、Wiki 导入和 Hermes 附件复用。
 */
@Service
@Transactional(readOnly = true)
public class DocumentMarkdownService {

    /** 转换场景：Wiki 导入。 */
    public static final String SCENE_WIKI_IMPORT = "WIKI_IMPORT";

    /** 转换场景：Hermes 附件。 */
    public static final String SCENE_HERMES_ATTACHMENT = "HERMES_ATTACHMENT";

    private final DocumentAssetService documentAssetService;
    private final DocumentMarkdownClientService documentMarkdownClientService;

    public DocumentMarkdownService(DocumentAssetService documentAssetService,
                                   DocumentMarkdownClientService documentMarkdownClientService) {
        this.documentAssetService = documentAssetService;
        this.documentMarkdownClientService = documentMarkdownClientService;
    }

    /**
     * 按资产 ID 读取并转换文档。
     */
    public DocumentMarkdownResult convert(Long assetId, String scene, Integer maxChars) {
        DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(assetId);
        DocumentAssetStorageService.StoredDocumentContent content = documentAssetService.loadContent(asset);
        DocumentMarkdownClientService.ConvertDocumentResponse converted = documentMarkdownClientService.convert(
                content.bytes(),
                asset.getFileName(),
                asset.getContentType(),
                scene,
                maxChars
        );
        return new DocumentMarkdownResult(
                asset.getId(),
                asset.getFileName(),
                converted.suggestedTitle(),
                converted.sourceFormat().isBlank() ? asset.getSourceFormat() : converted.sourceFormat(),
                converted.markdown(),
                converted.truncated(),
                converted.warnings()
        );
    }
}
