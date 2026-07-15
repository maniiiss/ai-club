package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantConversationMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;

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

    /** 校验一条消息是否为指定会话中的助手回答。 */
    java.util.Optional<AssistantConversationMessageEntity> findByIdAndSession_IdAndRole(Long id, Long sessionId, String role);

    /**
     * 读取一个会话内最相关的命中消息，用于搜索结果摘要。
     */
    @org.springframework.data.jpa.repository.Query("""
            select message
            from AssistantConversationMessageEntity message
            where message.session.id = :sessionId
              and lower(message.content) like lower(concat('%', :query, '%'))
            order by message.createdAt desc, message.id desc
            """)
    List<AssistantConversationMessageEntity> findMatchingMessages(@org.springframework.data.repository.query.Param("sessionId") Long sessionId,
                                                                    @org.springframework.data.repository.query.Param("query") String query,
                                                                    Pageable pageable);
}
