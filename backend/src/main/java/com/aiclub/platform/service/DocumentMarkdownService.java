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

    /** 转换场景：Hermes 个人文件库。 */
    public static final String SCENE_HERMES_FILE_LIBRARY = "HERMES_FILE_LIBRARY";

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
        return convert(assetId, scene, maxChars, null);
    }

    /**
     * 按资产 ID 读取并转换文档，可选指定 Wiki 导入图片的业务目录。
     */
    public DocumentMarkdownResult convert(Long assetId, String scene, Integer maxChars, String imageDirectory) {
        DocumentAssetEntity asset = documentAssetService.requireAccessibleAsset(assetId);
        return convertAsset(asset, scene, maxChars, imageDirectory);
    }

    /**
     * 转换已经由上层业务权限确认过的资产。
     * 工作项附件等场景必须按工作项关系授权，不能再次按上传者归属校验。
     */
    public DocumentMarkdownResult convertAsset(DocumentAssetEntity asset, String scene, Integer maxChars) {
        return convertAsset(asset, scene, maxChars, null);
    }

    private DocumentMarkdownResult convertAsset(DocumentAssetEntity asset, String scene, Integer maxChars, String imageDirectory) {
        DocumentAssetStorageService.StoredDocumentContent content = documentAssetService.loadContent(asset);
        DocumentMarkdownClientService.ConvertDocumentResponse converted = documentMarkdownClientService.convert(
                content.bytes(),
                asset.getFileName(),
                asset.getContentType(),
                scene,
                maxChars,
                imageDirectory
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
