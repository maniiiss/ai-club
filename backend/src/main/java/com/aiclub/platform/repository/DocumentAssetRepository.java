package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DocumentAssetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 平台通用文档资产仓储。
 */
public interface DocumentAssetRepository extends JpaRepository<DocumentAssetEntity, Long> {

    /**
     * 按资产ID和归属用户读取资产，避免用户越权转换或下载他人文档。
     */
    Optional<DocumentAssetEntity> findByIdAndOwnerUser_Id(Long id, Long ownerUserId);

    /**
     * 扫描过期临时资产，用于定时清理未绑定业务对象的上传文件。
     */
    List<DocumentAssetEntity> findAllByBindingStatusAndCreatedAtBeforeOrderByCreatedAtAscIdAsc(String bindingStatus, LocalDateTime createdAt);
}
