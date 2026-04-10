package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface PermissionRepository extends JpaRepository<PermissionEntity, Long>, JpaSpecificationExecutor<PermissionEntity> {

    boolean existsByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCaseAndIdNot(String code, Long id);

    Optional<PermissionEntity> findByCodeIgnoreCase(String code);

    List<PermissionEntity> findAllByOrderBySortOrderAscIdAsc();
}
