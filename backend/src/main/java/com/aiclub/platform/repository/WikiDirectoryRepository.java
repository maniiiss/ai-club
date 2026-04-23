package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiDirectoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Wiki 目录仓储。
 */
public interface WikiDirectoryRepository extends JpaRepository<WikiDirectoryEntity, Long> {

    /** 读取空间内全部目录，供目录树构建使用。 */
    List<WikiDirectoryEntity> findAllBySpace_IdOrderBySortOrderAscIdAsc(Long spaceId);

    /** 读取空间内指定目录。 */
    Optional<WikiDirectoryEntity> findBySpace_IdAndId(Long spaceId, Long id);

    /** 按名称读取空间根目录。 */
    Optional<WikiDirectoryEntity> findBySpace_IdAndParentDirectoryIsNullAndNameIgnoreCase(Long spaceId, String name);

    /** 按名称读取同级目录。 */
    Optional<WikiDirectoryEntity> findBySpace_IdAndParentDirectory_IdAndNameIgnoreCase(Long spaceId, Long parentDirectoryId, String name);

    /** 判断目录是否有子目录。 */
    boolean existsByParentDirectory_Id(Long parentDirectoryId);

    /** 判断目录 slug 在同级内是否已存在。 */
    @Query("""
            select count(directory) > 0
            from WikiDirectoryEntity directory
            where directory.space.id = :spaceId
              and lower(directory.slug) = lower(:slug)
              and (
                (:parentDirectoryId is null and directory.parentDirectory is null)
                or (:parentDirectoryId is not null and directory.parentDirectory.id = :parentDirectoryId)
              )
            """)
    boolean existsSiblingSlug(@Param("spaceId") Long spaceId,
                              @Param("parentDirectoryId") Long parentDirectoryId,
                              @Param("slug") String slug);

    /** 判断目录 slug 在同级内除指定目录外是否已存在。 */
    @Query("""
            select count(directory) > 0
            from WikiDirectoryEntity directory
            where directory.space.id = :spaceId
              and lower(directory.slug) = lower(:slug)
              and directory.id <> :directoryId
              and (
                (:parentDirectoryId is null and directory.parentDirectory is null)
                or (:parentDirectoryId is not null and directory.parentDirectory.id = :parentDirectoryId)
              )
            """)
    boolean existsSiblingSlugExcludingSelf(@Param("spaceId") Long spaceId,
                                           @Param("parentDirectoryId") Long parentDirectoryId,
                                           @Param("slug") String slug,
                                           @Param("directoryId") Long directoryId);

    /** 读取同级最大排序号。 */
    @Query("""
            select coalesce(max(directory.sortOrder), -1)
            from WikiDirectoryEntity directory
            where directory.space.id = :spaceId
              and (
                (:parentDirectoryId is null and directory.parentDirectory is null)
                or (:parentDirectoryId is not null and directory.parentDirectory.id = :parentDirectoryId)
              )
            """)
    int findMaxSortOrder(@Param("spaceId") Long spaceId, @Param("parentDirectoryId") Long parentDirectoryId);

    /** 读取绑定到指定项目的根目录。 */
    List<WikiDirectoryEntity> findAllByBoundProject_IdOrderBySortOrderAscIdAsc(Long projectId);
}
