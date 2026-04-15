package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.RepositoryScanRulesetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

/**
 * 仓库扫描规则集仓储。
 */
public interface RepositoryScanRulesetRepository extends JpaRepository<RepositoryScanRulesetEntity, Long>, JpaSpecificationExecutor<RepositoryScanRulesetEntity> {

    /**
     * 按编码查询规则集。
     */
    Optional<RepositoryScanRulesetEntity> findByCodeIgnoreCase(String code);

    /**
     * 查询启用中的规则集，默认项优先展示。
     */
    List<RepositoryScanRulesetEntity> findAllByEnabledTrueOrderByDefaultSelectedDescIdAsc();

    /**
     * 查询当前默认规则集。
     */
    Optional<RepositoryScanRulesetEntity> findFirstByDefaultSelectedTrueOrderByIdAsc();

    /**
     * 批量取消默认标记，确保系统只有一个默认规则集。
     */
    @Modifying
    @Query("update RepositoryScanRulesetEntity item set item.defaultSelected = false where item.id <> ?1 and item.defaultSelected = true")
    void clearDefaultSelectedExcept(Long id);

    /**
     * 统计默认规则集数量。
     */
    long countByDefaultSelectedTrue();
}
