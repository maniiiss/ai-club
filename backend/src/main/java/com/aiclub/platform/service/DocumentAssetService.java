package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DocumentAssetSummary;
import com.aiclub.platform.repository.DocumentAssetRepository;
import com.aiclub.platform.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * 平台通用文档资产服务，统一负责上传、绑定、下载和临时资产清理。
 */
@Service
@Transactional(readOnly = true)
public class DocumentAssetService {

    /** 资产绑定状态：临时。 */
    public static final String BINDING_STATUS_TEMP = "TEMP";

    /** 资产绑定状态：已绑定。 */
    public static final String BINDING_STATUS_BOUND = "BOUND";

    /** 业务类型：Wiki 页面来源文件。 */
    public static final String BIZ_TYPE_WIKI_PAGE = "WIKI_PAGE";

    /** 业务类型：Hermes 会话附件。 */
    public static final String BIZ_TYPE_HERMES_ATTACHMENT = "HERMES_ATTACHMENT";

    private final AuthService authService;
    private final UserRepository userRepository;
    private final DocumentAssetRepository documentAssetRepository;
    private final DocumentAssetStorageService documentAssetStorageService;

    public DocumentAssetService(AuthService authService,
                                UserRepository userRepository,
                                DocumentAssetRepository documentAssetRepository,
                                DocumentAssetStorageService documentAssetStorageService) {
        this.authService = authService;
        this.userRepository = userRepository;
        this.documentAssetRepository = documentAssetRepository;
        this.documentAssetStorageService = documentAssetStorageService;
    }

    /**
     * 上传文档并创建临时文档资产。
     */
    @Transactional
    public DocumentAssetSummary uploadAsset(MultipartFile file, String directoryName) {
        UserEntity currentUser = requireCurrentUser();
        DocumentAssetStorageService.StoredDocumentAsset stored = documentAssetStorageService.store(file, directoryName);
        DocumentAssetEntity entity = new DocumentAssetEntity();
        entity.setOwnerUser(currentUser);
        entity.setFileName(stored.fileName());
        entity.setContentType(stored.contentType());
        entity.setFileSize(stored.fileSize());
        entity.setObjectKey(stored.objectKey());
        entity.setSourceFormat(stored.sourceFormat());
        entity.setBindingStatus(BINDING_STATUS_TEMP);
        entity.setBoundBizType("");
        DocumentAssetEntity saved = documentAssetRepository.save(entity);
        return toSummary(saved);
    }

    /**
     * 读取当前用户可访问的文档资产。
     */
    public DocumentAssetEntity requireAccessibleAsset(Long assetId) {
        Long currentUserId = authService.currentUser().id();
        return documentAssetRepository.findByIdAndOwnerUser_Id(assetId, currentUserId)
                .orElseThrow(() -> new NoSuchElementException("文档资产不存在"));
    }

    /**
     * 把文档资产绑定到具体业务对象，后续不再属于待清理的临时资产。
     */
    @Transactional
    public DocumentAssetEntity bindAsset(DocumentAssetEntity asset, String bizType, Long bizId) {
        if (asset == null) {
            throw new IllegalArgumentException("文档资产不能为空");
        }
        asset.setBindingStatus(BINDING_STATUS_BOUND);
        asset.setBoundBizType(bizType == null ? "" : bizType.trim());
        asset.setBoundBizId(bizId);
        return documentAssetRepository.save(asset);
    }

    /**
     * 读取资产原始文件内容。
     */
    public DocumentAssetStorageService.StoredDocumentContent loadContent(DocumentAssetEntity asset) {
        if (asset == null) {
            throw new IllegalArgumentException("文档资产不能为空");
        }
        return documentAssetStorageService.load(asset.getObjectKey());
    }

    /**
     * 返回超过 24 小时仍未绑定的临时资产列表。
     */
    public List<DocumentAssetEntity> findExpiredTempAssets() {
        LocalDateTime expiredAt = LocalDateTime.now().minusHours(24);
        return documentAssetRepository.findAllByBindingStatusAndCreatedAtBeforeOrderByCreatedAtAscIdAsc(BINDING_STATUS_TEMP, expiredAt);
    }

    private UserEntity requireCurrentUser() {
        Long currentUserId = authService.currentUser().id();
        return userRepository.findById(currentUserId)
                .orElseThrow(() -> new NoSuchElementException("当前用户不存在"));
    }

    private DocumentAssetSummary toSummary(DocumentAssetEntity entity) {
        return new DocumentAssetSummary(
                entity.getId(),
                entity.getFileName(),
                entity.getContentType(),
                entity.getFileSize(),
                entity.getSourceFormat(),
                entity.getBindingStatus()
        );
    }
}
