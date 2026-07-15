package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantConversationSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Assistant 云端会话主记录仓储。
 */
public interface AssistantConversationSessionRepository extends JpaRepository<AssistantConversationSessionEntity, Long> {

    /**
     * 按当前用户和归档状态分页读取会话列表。
     */
    Page<AssistantConversationSessionEntity> findByUser_IdAndArchived(Long userId, boolean archived, Pageable pageable);

    /**
     * 按当前用户、归档状态和项目 ID 分页读取项目助手会话。
     */
    Page<AssistantConversationSessionEntity> findByUser_IdAndArchivedAndProjectId(Long userId,
                                                                               boolean archived,
                                                                               Long projectId,
                                                                               Pageable pageable);

    /**
     * 在当前项目的会话标题、最近预览和历史消息中进行全文搜索。
     * 业务意图：搜索结果仍按会话归并，避免同一会话命中多条消息后重复出现在左侧。
     */
    @Query(value = """
            select distinct session
            from AssistantConversationSessionEntity session
            left join AssistantConversationMessageEntity message on message.session.id = session.id
            where session.user.id = :userId
              and session.projectId = :projectId
              and (:includeArchived = true or session.archived = false)
              and (
                    lower(coalesce(session.title, '')) like lower(concat('%', :query, '%'))
                    or lower(coalesce(session.latestPreview, '')) like lower(concat('%', :query, '%'))
                    or lower(coalesce(message.content, '')) like lower(concat('%', :query, '%'))
              )
            """,
            countQuery = """
            select count(distinct session.id)
            from AssistantConversationSessionEntity session
            left join AssistantConversationMessageEntity message on message.session.id = session.id
            where session.user.id = :userId
              and session.projectId = :projectId
              and (:includeArchived = true or session.archived = false)
              and (
                    lower(coalesce(session.title, '')) like lower(concat('%', :query, '%'))
                    or lower(coalesce(session.latestPreview, '')) like lower(concat('%', :query, '%'))
                    or lower(coalesce(message.content, '')) like lower(concat('%', :query, '%'))
              )
            """)
    Page<AssistantConversationSessionEntity> searchProjectSessions(@Param("userId") Long userId,
                                                                  @Param("projectId") Long projectId,
                                                                  @Param("query") String query,
                                                                  @Param("includeArchived") boolean includeArchived,
                                                                  Pageable pageable);

    /**
     * 读取没有绑定项目、任务、迭代、测试计划或 Wiki 的纯聊天会话。
     */
    @Query("""
            select session
            from AssistantConversationSessionEntity session
            where session.user.id = :userId
              and session.archived = :archived
              and session.projectId is null
              and session.taskId is null
              and session.iterationId is null
              and session.planId is null
              and session.wikiSpaceId is null
              and session.wikiPageId is null
            """)
    Page<AssistantConversationSessionEntity> findGlobalSessions(@Param("userId") Long userId,
                                                             @Param("archived") boolean archived,
                                                             Pageable pageable);

    /**
     * 按当前用户读取指定会话，避免越权访问。
     */
    Optional<AssistantConversationSessionEntity> findByIdAndUser_Id(Long id, Long userId);

    /**
     * 查找当前用户未归档且没有消息的会话。
     */
    List<AssistantConversationSessionEntity> findByUser_IdAndArchivedAndLastMessageAtIsNull(Long userId, boolean archived);

    /**
     * 查找当前用户在完全相同页面上下文下尚未发送消息的会话。
     * 业务意图：项目浮标和纯聊天页都可能先创建空会话，复用时必须按上下文隔离，避免串场。
     */
    @Query("""
            select session
            from AssistantConversationSessionEntity session
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
    List<AssistantConversationSessionEntity> findUnusedSessionByContext(@Param("userId") Long userId,
                                                                     @Param("routeName") String routeName,
                                                                     @Param("projectId") Long projectId,
                                                                     @Param("taskId") Long taskId,
                                                                     @Param("iterationId") Long iterationId,
                                                                     @Param("planId") Long planId,
                                                                     @Param("wikiSpaceId") Long wikiSpaceId,
                                                                     @Param("wikiPageId") Long wikiPageId);
}
