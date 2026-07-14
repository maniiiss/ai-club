package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantConversationAttachmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

/**
 * Assistant 会话附件仓储。
 */
public interface AssistantConversationAttachmentRepository extends JpaRepository<AssistantConversationAttachmentEntity, Long> {

    /**
     * 批量读取消息关联附件，供会话详情按消息回显。
     */
    List<AssistantConversationAttachmentEntity> findAllByMessage_IdIn(List<Long> messageIds);

    /**
     * 按会话与用户读取附件，确保下载时不越权。
     */
    Optional<AssistantConversationAttachmentEntity> findByIdAndMessage_Session_IdAndMessage_Session_User_Id(Long id, Long sessionId, Long userId);

    /**
     * 读取会话最近一条用户消息上的附件，用于无附件追问时延续最近文档上下文。
     */
    @Query("""
            select attachment
            from AssistantConversationAttachmentEntity attachment
            join fetch attachment.documentAsset asset
            join attachment.message message
            where message.session.id = :sessionId
              and message.role = 'user'
            order by message.createdAt desc, message.id desc, attachment.createdAt asc, attachment.id asc
            """)
    List<AssistantConversationAttachmentEntity> findRecentUserAttachments(Long sessionId);
}
