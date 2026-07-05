package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.HermesFileLibraryItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Hermes 个人文件库仓储。
 */
public interface HermesFileLibraryItemRepository extends JpaRepository<HermesFileLibraryItemEntity, Long> {

    /** 按归属用户和关键字读取个人文件库。 */
    List<HermesFileLibraryItemEntity> findAllByOwnerUser_IdAndTitleContainingIgnoreCaseOrderByUpdatedAtDescIdDesc(Long ownerUserId, String title);

    /** 读取当前用户启用中的文件库条目，供 Hermes 问答召回前做范围判断。 */
    List<HermesFileLibraryItemEntity> findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(Long ownerUserId);

    /** 按归属读取单条文件库记录，避免用户越权操作他人文件。 */
    Optional<HermesFileLibraryItemEntity> findByIdAndOwnerUser_Id(Long id, Long ownerUserId);
}
