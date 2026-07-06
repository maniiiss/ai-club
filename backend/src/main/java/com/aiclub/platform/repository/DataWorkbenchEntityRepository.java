package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DataWorkbenchEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface DataWorkbenchEntityRepository extends JpaRepository<DataWorkbenchEntity, Long>, JpaSpecificationExecutor<DataWorkbenchEntity> {

    @EntityGraph(attributePaths = "fields")
    Optional<DataWorkbenchEntity> findWithFieldsById(Long id);

    /**
     * 项目内按实体编码查找，用于公众端 DataChange DSL 引用。
     */
    @EntityGraph(attributePaths = "fields")
    Optional<DataWorkbenchEntity> findWithFieldsByPlatformProjectIdAndEntityCode(Long platformProjectId, String entityCode);

    @EntityGraph(attributePaths = "fields")
    List<DataWorkbenchEntity> findAllByEnabledTrueOrderByIdAsc();

    /**
     * 项目内启用状态的实体，公众端项目研发模块使用。
     */
    @EntityGraph(attributePaths = "fields")
    List<DataWorkbenchEntity> findAllByPlatformProjectIdAndEnabledTrueOrderByIdAsc(Long platformProjectId);

    /**
     * 管理端按项目筛选实体列表。
     */
    @EntityGraph(attributePaths = "fields")
    List<DataWorkbenchEntity> findAllByPlatformProjectIdOrderByIdAsc(Long platformProjectId);

    /**
     * 判断项目内是否已有同名实体编码。
     */
    boolean existsByPlatformProjectIdAndEntityCodeIgnoreCase(Long platformProjectId, String entityCode);
}
