package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Assistant 会话消息记录仓储。
 */
public interface AssistantConversationMessageRepository extends JpaRepository<AssistantConversationMessageEntity, Long> {

    /**
     * 按消息创建顺序读取指定会话的全部消息。
     */
    List<AssistantConversationMessageEntity> findBySession_IdOrderByCreatedAtAscIdAsc(Long sessionId);

    /**
     * 判断指定会话是否已有消息记录。
     */
    boolean existsBySession_Id(Long sessionId);
}
