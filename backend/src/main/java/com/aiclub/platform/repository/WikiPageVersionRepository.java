package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Wiki 页面版本仓储，负责读取历史版本与指定版本快照。
 */
public interface WikiPageVersionRepository extends JpaRepository<WikiPageVersionEntity, Long> {

    /** 按页面倒序读取版本历史。 */
    List<WikiPageVersionEntity> findAllByPage_IdOrderByVersionNumberDesc(Long pageId);

    /** 读取页面指定版本。 */
    Optional<WikiPageVersionEntity> findByPage_IdAndVersionNumber(Long pageId, Integer versionNumber);

    /** 统计页面版本数量，供图谱元数据展示。 */
    long countByPage_Id(Long pageId);
}
