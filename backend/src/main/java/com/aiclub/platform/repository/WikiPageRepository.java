package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Wiki 页面仓储，封装页面树、slug 和项目内查询。
 */
public interface WikiPageRepository extends JpaRepository<WikiPageEntity, Long>, JpaSpecificationExecutor<WikiPageEntity> {

    /** 判断项目内 slug 是否已经存在。 */
    boolean existsByProject_IdAndSlugIgnoreCase(Long projectId, String slug);

    /** 判断项目内除指定页面外是否存在同名 slug。 */
    boolean existsByProject_IdAndSlugIgnoreCaseAndIdNot(Long projectId, String slug, Long id);

    /** 按项目和 slug 读取页面。 */
    Optional<WikiPageEntity> findByProject_IdAndSlugIgnoreCase(Long projectId, String slug);

    /** 按项目和页面 ID 读取页面。 */
    Optional<WikiPageEntity> findByProject_IdAndId(Long projectId, Long id);

    /** 读取项目内全部页面，供页面树和图谱构建使用。 */
    List<WikiPageEntity> findAllByProject_IdOrderBySortOrderAscIdAsc(Long projectId);

    /** 读取项目内指定 ID 集合的页面。 */
    List<WikiPageEntity> findAllByProject_IdAndIdIn(Long projectId, List<Long> ids);

    /** 判断指定页面是否还有子页面。 */
    boolean existsByParentPage_Id(Long parentPageId);

    /** 统计同级页面数量，用于自动生成排序号。 */
    @Query("""
            select coalesce(max(page.sortOrder), -1)
            from WikiPageEntity page
            where page.project.id = :projectId
              and (
                (:parentPageId is null and page.parentPage is null)
                or (:parentPageId is not null and page.parentPage.id = :parentPageId)
              )
            """)
    int findMaxSortOrder(@Param("projectId") Long projectId, @Param("parentPageId") Long parentPageId);

    /** 读取项目内最近更新页面，供 Assistant 上下文兜底使用。 */
    List<WikiPageEntity> findAllByProject_IdOrderByUpdatedAtDescIdDesc(Long projectId, Pageable pageable);
}
