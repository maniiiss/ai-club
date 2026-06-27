package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.HermesConversationSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
     * 按当前用户、归档状态和项目 ID 分页读取项目助手会话。
     */
    Page<HermesConversationSessionEntity> findByUser_IdAndArchivedAndProjectId(Long userId,
                                                                               boolean archived,
                                                                               Long projectId,
                                                                               Pageable pageable);

    /**
     * 读取没有绑定项目、任务、迭代、测试计划或 Wiki 的纯聊天会话。
     */
    @Query("""
            select session
            from HermesConversationSessionEntity session
            where session.user.id = :userId
              and session.archived = :archived
              and session.projectId is null
              and session.taskId is null
              and session.iterationId is null
              and session.planId is null
              and session.wikiSpaceId is null
              and session.wikiPageId is null
            """)
    Page<HermesConversationSessionEntity> findGlobalSessions(@Param("userId") Long userId,
                                                             @Param("archived") boolean archived,
                                                             Pageable pageable);

    /**
     * 按当前用户读取指定会话，避免越权访问。
     */
    Optional<HermesConversationSessionEntity> findByIdAndUser_Id(Long id, Long userId);

    /**
     * 查找当前用户未归档且没有消息的会话。
     */
    List<HermesConversationSessionEntity> findByUser_IdAndArchivedAndLastMessageAtIsNull(Long userId, boolean archived);

    /**
     * 查找当前用户在完全相同页面上下文下尚未发送消息的会话。
     * 业务意图：项目浮标和纯聊天页都可能先创建空会话，复用时必须按上下文隔离，避免串场。
     */
    @Query("""
            select session
            from HermesConversationSessionEntity session
            where session.user.id = :userId
              and session.archived = false
              and session.lastMessageAt is null
              and session.routeName = :routeName
              and ((:projectId is null and session.projectId is null) or session.projectId = :projectId)
              and ((:taskId is null and session.taskId is null) or session.taskId = :taskId)
              and ((:iterationId is null and session.iterationId is null) or session.iterationId = :iterationId)
              and ((:planId is null and session.planId is null) or session.planId = :planId)
              and ((:wikiSpaceId is null and session.wikiSpaceId is null) or session.wikiSpaceId = :wikiSpaceId)
              and ((:wikiPageId is null and session.wikiPageId is null) or session.wikiPageId = :wikiPageId)
            order by session.id asc
            """)
    List<HermesConversationSessionEntity> findUnusedSessionByContext(@Param("userId") Long userId,
                                                                     @Param("routeName") String routeName,
                                                                     @Param("projectId") Long projectId,
                                                                     @Param("taskId") Long taskId,
                                                                     @Param("iterationId") Long iterationId,
                                                                     @Param("planId") Long planId,
                                                                     @Param("wikiSpaceId") Long wikiSpaceId,
                                                                     @Param("wikiPageId") Long wikiPageId);
}
