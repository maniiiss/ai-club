package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageSyncTaskV2Entity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 空间化 Wiki 页面 Hindsight 同步任务仓储。
 */
public interface WikiPageSyncTaskV2Repository extends JpaRepository<WikiPageSyncTaskV2Entity, Long> {

    /** 轮询当前可执行的待同步任务。 */
    List<WikiPageSyncTaskV2Entity> findAllByStatusAndNextAttemptAtLessThanEqualOrderByNextAttemptAtAscIdAsc(
            String status,
            LocalDateTime nextAttemptAt,
            Pageable pageable
    );

    /** 读取页面最近一次 retain 同步任务，供手动重新排队时复用。 */
    Optional<WikiPageSyncTaskV2Entity> findFirstByPage_IdAndOperationOrderByIdDesc(Long pageId, String operation);
}
