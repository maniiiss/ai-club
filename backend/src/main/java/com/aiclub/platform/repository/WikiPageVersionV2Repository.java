package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageVersionV2Entity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 空间化 Wiki 页面版本仓储。
 */
public interface WikiPageVersionV2Repository extends JpaRepository<WikiPageVersionV2Entity, Long> {

    /** 按页面读取版本历史。 */
    List<WikiPageVersionV2Entity> findAllByPage_IdOrderByVersionNumberDesc(Long pageId);

    /** 读取指定页面版本。 */
    Optional<WikiPageVersionV2Entity> findByPage_IdAndVersionNumber(Long pageId, Integer versionNumber);

    /** 统计页面版本数量。 */
    long countByPage_Id(Long pageId);
}
