package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiLightragIndexStateEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WikiLightragIndexStateRepository extends JpaRepository<WikiLightragIndexStateEntity, Long> {

    /**
     * 找出状态为 PENDING 或 FAILED 的页面，定时兜底扫描补入队。
     */
    List<WikiLightragIndexStateEntity> findAllByStatusInOrderByPageIdAsc(List<String> statuses);

    /**
     * 找出已索引版本落后于当前版本号的页面（索引版本为 null 也算落后）。
     */
    @Query("select s from WikiLightragIndexStateEntity s " +
            "where s.status = 'INDEXED' and (s.indexedVersion is null or s.indexedVersion < :currentVersion)")
    List<WikiLightragIndexStateEntity> findStaleIndexed(@Param("currentVersion") Integer currentVersion);

    @Modifying
    @Query("update WikiLightragIndexStateEntity s set s.status = :status, s.lastError = :lastError " +
            "where s.pageId = :pageId")
    int updateStatus(@Param("pageId") Long pageId,
                     @Param("status") String status,
                     @Param("lastError") String lastError);
}
