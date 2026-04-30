package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageSyncTaskEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Wiki 页面 Hindsight 同步任务仓储。
 */
public interface WikiPageSyncTaskRepository extends JpaRepository<WikiPageSyncTaskEntity, Long> {

    /** 按调度时间读取可执行的待同步任务。 */
    List<WikiPageSyncTaskEntity> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            String status,
            LocalDateTime nextAttemptAt,
            Pageable pageable
    );

    /** 读取页面最近一次 retain 同步任务，供手动重新排队时复用。 */
    Optional<WikiPageSyncTaskEntity> findFirstByPage_IdAndOperationOrderByIdDesc(Long pageId, String operation);
}
