package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.RoleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<RoleEntity, Long>, JpaSpecificationExecutor<RoleEntity> {

    boolean existsByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCaseAndIdNot(String code, Long id);

    List<RoleEntity> findAllByOrderByIdAsc();

    @Query("select distinct r from RoleEntity r left join fetch r.permissions where r.id = :id")
    Optional<RoleEntity> findWithPermissionsById(@Param("id") Long id);
}
