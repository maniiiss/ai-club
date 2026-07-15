package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantMessageFeedbackEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

/** GitPilot 单条回答反馈仓储。 */
public interface AssistantMessageFeedbackRepository extends JpaRepository<AssistantMessageFeedbackEntity, Long>, JpaSpecificationExecutor<AssistantMessageFeedbackEntity> {
    /** 查找当前用户对某条回答的已有评价，实现幂等覆盖。 */
    Optional<AssistantMessageFeedbackEntity> findBySubmitterUserIdAndAssistantMessageId(Long userId, Long assistantMessageId);
    /** 读取当前用户某个会话的全部反馈。 */
    List<AssistantMessageFeedbackEntity> findAllBySubmitterUserIdAndSessionIdOrderByCreatedAtDesc(Long userId, Long sessionId);
    /** 读取当前用户的反馈。 */
    List<AssistantMessageFeedbackEntity> findAllBySubmitterUserIdOrderByCreatedAtDesc(Long userId);
    /** 分页读取当前用户反馈。 */
    org.springframework.data.domain.Page<AssistantMessageFeedbackEntity> findAllBySubmitterUserId(Long userId, Pageable pageable);
    /** 分页读取当前用户指定会话反馈。 */
    org.springframework.data.domain.Page<AssistantMessageFeedbackEntity> findAllBySubmitterUserIdAndSessionId(Long userId, Long sessionId, Pageable pageable);
    /** 统计状态数量。 */
    long countByStatus(String status);
    /** 统计评价方向数量。 */
    long countByVote(String vote);
}
