package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiSpaceMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Wiki 空间成员仓储。
 */
public interface WikiSpaceMemberRepository extends JpaRepository<WikiSpaceMemberEntity, Long> {

    /** 按空间读取成员列表。 */
    List<WikiSpaceMemberEntity> findAllBySpace_IdOrderByIdAsc(Long spaceId);

    /** 按用户读取可见空间成员关系。 */
    List<WikiSpaceMemberEntity> findAllByUser_IdOrderByIdAsc(Long userId);

    /** 读取指定用户在空间中的成员关系。 */
    Optional<WikiSpaceMemberEntity> findBySpace_IdAndUser_Id(Long spaceId, Long userId);

    /** 清理空间已有成员后整体替换。 */
    void deleteAllBySpace_Id(Long spaceId);

    /** 统计空间管理员数量。 */
    long countBySpace_IdAndMemberRoleIgnoreCase(Long spaceId, String memberRole);
}
