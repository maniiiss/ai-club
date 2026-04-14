package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Hermes 云端会话主记录仓储。
 */
public interface HermesConversationSessionRepository extends JpaRepository<HermesConversationSessionEntity, Long> {

    /**
     * 按当前用户和归档状态分页读取会话列表。
     */
    Page<HermesConversationSessionEntity> findByUser_IdAndArchived(Long userId, boolean archived, Pageable pageable);

    /**
     * 按当前用户读取指定会话，避免越权访问。
     */
    Optional<HermesConversationSessionEntity> findByIdAndUser_Id(Long id, Long userId);

    /**
     * 查找当前用户未归档且没有消息的会话。
     */
    List<HermesConversationSessionEntity> findByUser_IdAndArchivedAndLastMessageAtIsNull(Long userId, boolean archived);
}
