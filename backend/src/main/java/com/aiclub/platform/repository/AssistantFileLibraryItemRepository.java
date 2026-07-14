package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantFileLibraryItemEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Assistant 个人文件库仓储。
 */
public interface AssistantFileLibraryItemRepository extends JpaRepository<AssistantFileLibraryItemEntity, Long> {

    /** 按归属用户和关键字读取个人文件库。 */
    List<AssistantFileLibraryItemEntity> findAllByOwnerUser_IdAndTitleContainingIgnoreCaseOrderByUpdatedAtDescIdDesc(Long ownerUserId, String title);

    /** 读取当前用户启用中的文件库条目，供 Assistant 问答召回前做范围判断。 */
    List<AssistantFileLibraryItemEntity> findAllByOwnerUser_IdAndEnabledTrueOrderByUpdatedAtDescIdDesc(Long ownerUserId);

    /** 按归属读取单条文件库记录，避免用户越权操作他人文件。 */
    Optional<AssistantFileLibraryItemEntity> findByIdAndOwnerUser_Id(Long id, Long ownerUserId);
}
