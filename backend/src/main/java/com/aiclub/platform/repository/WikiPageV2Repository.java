package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageV2Entity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

/**
 * 空间化 Wiki 页面仓储。
 */
public interface WikiPageV2Repository extends JpaRepository<WikiPageV2Entity, Long> {

    /** 读取空间内指定页面。 */
    Optional<WikiPageV2Entity> findBySpace_IdAndId(Long spaceId, Long id);

    /** 按 slug 读取空间页面。 */
    Optional<WikiPageV2Entity> findBySpace_IdAndSlugIgnoreCase(Long spaceId, String slug);

    /** 判断空间内 slug 是否存在。 */
    boolean existsBySpace_IdAndSlugIgnoreCase(Long spaceId, String slug);

    /** 判断空间内 slug 除指定页面外是否存在。 */
    boolean existsBySpace_IdAndSlugIgnoreCaseAndIdNot(Long spaceId, String slug, Long id);

    /** 读取目录下页面列表。 */
    List<WikiPageV2Entity> findAllByDirectory_IdOrderByUpdatedAtDescIdDesc(Long directoryId);

    /** 判断目录下是否还有页面。 */
    boolean existsByDirectory_Id(Long directoryId);

    /** 判断页面下是否还有子页面。 */
    boolean existsByParentPage_Id(Long parentPageId);

    /** 读取空间内全部页面。 */
    List<WikiPageV2Entity> findAllBySpace_IdOrderByUpdatedAtDescIdDesc(Long spaceId);

    /** 读取空间内最近更新页面。 */
    List<WikiPageV2Entity> findAllBySpace_IdOrderByUpdatedAtDescIdDesc(Long spaceId, Pageable pageable);

    /** 批量读取页面。 */
    List<WikiPageV2Entity> findAllByIdIn(List<Long> ids);

    /** 按空间读取页面详情，并联表抓取来源文档资产，供下载原文件时复用。 */
    @Query("""
            select page
            from WikiPageV2Entity page
            left join fetch page.sourceDocumentAsset
            where page.space.id = :spaceId
              and page.id = :id
            """)
    Optional<WikiPageV2Entity> findDetailBySpace_IdAndId(Long spaceId, Long id);
}
